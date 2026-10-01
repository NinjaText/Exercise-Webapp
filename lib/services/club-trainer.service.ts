import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { appBaseUrl } from "@/lib/utils/app-url";
import { ClubError } from "@/lib/services/club-error";

/**
 * Club trainer lifecycle (spec §5). Each club has one invited TRAINER who owns
 * the club's program copies and coaches its members. They join through a
 * Clerk org invitation carrying `publicMetadata.invitedRole = "TRAINER"`.
 */

export const CLUB_TRAINER_INVITE_ROLE = "TRAINER";

/** Shown on /join and returned by the join action until the trainer accepts. */
export const CLUB_NOT_OPEN_MESSAGE = "This club isn't open yet. Please check back soon.";

const EMAIL_TAKEN_MESSAGE =
  "That email already has an account. The club trainer needs a dedicated account, so use a different email.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InvitationLike = { publicMetadata?: Record<string, unknown> | null };

function isTrainerInvite(invitation: InvitationLike): boolean {
  return invitation.publicMetadata?.invitedRole === CLUB_TRAINER_INVITE_ROLE;
}

function isClub(org: Organization | null): org is Organization {
  return org !== null && getOrgCapabilities(org).billing === "member";
}

export function normalizeTrainerEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new ClubError("invalid_input", "Enter a valid club trainer email.");
  }
  return email;
}

/** D4: one person, one org — the trainer email must not be an existing app user. */
export async function assertTrainerEmailFree(email: string): Promise<void> {
  const taken = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw new ClubError("trainer_email_taken", EMAIL_TAKEN_MESSAGE);
}

/** The club's TRAINER user: an onboarded one first, then the newest. */
export async function getClubTrainer(clerkOrgId: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { clerkOrgId, role: "TRAINER" },
    orderBy: [{ onboarded: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Sends (or resends) the club trainer invitation. Any pending trainer invite
 * for the org is revoked first, so only the newest link works.
 */
export async function inviteClubTrainer(clerkOrgId: string, rawEmail: string): Promise<void> {
  const email = normalizeTrainerEmail(rawEmail);
  await assertTrainerEmailFree(email);

  try {
    const client = await clerkClient();
    const pending = await client.organizations.getOrganizationInvitationList({
      organizationId: clerkOrgId,
      status: ["pending"],
      limit: 100,
    });
    for (const invitation of pending.data.filter(isTrainerInvite)) {
      await client.organizations.revokeOrganizationInvitation({ organizationId: clerkOrgId, invitationId: invitation.id });
    }
    await client.organizations.createOrganizationInvitation({
      organizationId: clerkOrgId,
      emailAddress: email,
      role: "org:admin",
      publicMetadata: { invitedRole: CLUB_TRAINER_INVITE_ROLE },
      redirectUrl: `${appBaseUrl()}/onboarding/club-trainer`,
    });
  } catch (err) {
    console.error("Club trainer invitation failed:", err);
    throw new ClubError("trainer_invite_failed", "Couldn't send the club trainer invitation. Please try again.");
  }
}

export async function getPendingTrainerInvite(clerkOrgId: string): Promise<{ email: string; createdAt: Date } | null> {
  const client = await clerkClient();
  const pending = await client.organizations.getOrganizationInvitationList({
    organizationId: clerkOrgId,
    status: ["pending"],
    limit: 100,
  });
  const newest = pending.data.filter(isTrainerInvite).sort((a, b) => b.createdAt - a.createdAt)[0];
  return newest ? { email: newest.emailAddress, createdAt: new Date(newest.createdAt) } : null;
}

/**
 * Removes the current trainer from the club. The membership webhook also nulls
 * `clerkOrgId`; doing it here too means the club reads as trainer-less at once.
 * The account is also deactivated: club trainer accounts are dedicated, and the
 * removed trainer still owns the club's programs until a replacement accepts,
 * so they must not keep working through program actions in the meantime.
 */
export async function removeClubTrainer(clerkOrgId: string): Promise<void> {
  const trainer = await getClubTrainer(clerkOrgId);
  if (!trainer) return;
  const client = await clerkClient();
  await client.organizations.deleteOrganizationMembership({ organizationId: clerkOrgId, userId: trainer.clerkId });
  try {
    await prisma.user.update({ where: { id: trainer.id }, data: { clerkOrgId: null, isActive: false } });
  } catch (err) {
    // The Clerk membership is already gone; the caller must know the DB row is stale.
    console.error("Club trainer removed in Clerk but the DB update failed:", { clerkOrgId, trainerId: trainer.id }, err);
    throw new ClubError(
      "trainer_remove_failed",
      "The trainer was removed from the club in Clerk, but their account record could not be updated. Check the account in the database before inviting a replacement."
    );
  }
}

/**
 * Hands the club to a (new) trainer: members' programs, and the club's
 * non-global starter templates. Starters may only be Global Programs or the
 * club trainer's own templates (assertStarters), so any non-global starter not
 * owned by `toTrainerId` was authored by a previous club trainer. Idempotent.
 */
export async function transferClubOwnership(
  clerkOrgId: string,
  toTrainerId: string
): Promise<{ programs: number; templates: number }> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org) return { programs: 0, templates: 0 };

  const members = await prisma.user.findMany({ where: { clerkOrgId, role: "CLIENT" }, select: { id: true } });
  let programs = 0;
  if (members.length > 0) {
    const res = await prisma.program.updateMany({
      where: { clientId: { in: members.map((m) => m.id) }, NOT: { trainerId: toTrainerId } },
      data: { trainerId: toTrainerId },
    });
    programs = res.count;
  }

  let templates = 0;
  if (org.starterProgramIds.length > 0) {
    const res = await prisma.program.updateMany({
      where: {
        id: { in: org.starterProgramIds },
        isTemplate: true,
        isGlobal: false,
        trainerId: { not: null },
        NOT: { trainerId: toTrainerId },
      },
      data: { trainerId: toTrainerId },
    });
    templates = res.count;
  }
  return { programs, templates };
}

/** Only an existing row that is already this club's trainer may be reused. */
function isThisClubsTrainer(user: Pick<User, "role" | "clerkOrgId">, org: Organization): boolean {
  return user.role === "TRAINER" && user.clerkOrgId === org.clerkOrgId;
}

/**
 * Creates (or confirms) the club trainer's row: role TRAINER, never CLIENT, no
 * MemberSubscription, no trainer billing. Shared by the Clerk webhook and the
 * onboarding page so whichever runs first wins and the other is a no-op.
 *
 * Never moves an existing account: anyone already in the app — a trainer of
 * another org, a client anywhere, or someone holding the email — is refused
 * with `trainer_email_taken` and nothing is changed.
 */
export async function ensureClubTrainerUser(clerkUserId: string, org: Organization): Promise<User> {
  if (!isClub(org)) throw new ClubError("not_found", "Not a club.");

  const existing = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  if (existing) {
    if (!isThisClubsTrainer(existing, org)) throw new ClubError("trainer_email_taken", EMAIL_TAKEN_MESSAGE);
    // Idempotent: repairs a crash between the create below and the transfer.
    await transferClubOwnership(org.clerkOrgId, existing.id);
    return existing;
  }

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const email = (
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress
  )?.toLowerCase();
  if (!email) throw new Error(`Clerk user ${clerkUserId} has no email`);
  await assertTrainerEmailFree(email);

  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        email,
        firstName: clerkUser.firstName ?? "",
        lastName: clerkUser.lastName ?? "",
        imageUrl: clerkUser.imageUrl,
        role: "TRAINER",
        clerkOrgId: org.clerkOrgId,
        onboarded: false,
      },
    });
  } catch (err) {
    // The webhook and the onboarding page can race on the same clerkId.
    if ((err as { code?: string }).code !== "P2002") throw err;
    const raced = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
    if (!raced || !isThisClubsTrainer(raced, org)) throw new ClubError("trainer_email_taken", EMAIL_TAKEN_MESSAGE);
    await transferClubOwnership(org.clerkOrgId, raced.id);
    return raced;
  }

  await transferClubOwnership(org.clerkOrgId, user.id);
  return user;
}

/**
 * After `ensureClubTrainerUser` refused an account, take back the Clerk
 * `org:admin` membership the invite granted. Leaving it would let the session's
 * active org attach the account to the club (getCurrentUser syncs orgId) and
 * let it manage the org in Clerk. Skipped when the DB row already belongs to
 * this org, so a real member is never removed. Never throws.
 */
export async function revokeRefusedTrainerMembership(clerkUserId: string, clerkOrgId: string): Promise<void> {
  try {
    const row = await prisma.user.findUnique({ where: { clerkId: clerkUserId }, select: { clerkOrgId: true } });
    if (row?.clerkOrgId === clerkOrgId) return;
    const client = await clerkClient();
    await client.organizations.deleteOrganizationMembership({ organizationId: clerkOrgId, userId: clerkUserId });
    console.warn("[club-trainer] removed refused trainer membership", { clerkUserId, clerkOrgId });
  } catch (err) {
    console.error("[club-trainer] failed to remove refused trainer membership", { clerkUserId, clerkOrgId }, err);
  }
}

async function clerkUserEmails(clerkUserId: string): Promise<Set<string>> {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  return new Set(clerkUser.emailAddresses.map((e) => e.emailAddress.toLowerCase()));
}

/**
 * Whether this Clerk user has a pending or accepted club TRAINER invite for
 * `clerkOrgId` (a member-billed org). Used to stop the client onboarding from
 * creating a CLIENT row for an invited club trainer.
 */
export async function hasClubTrainerInvite(clerkUserId: string, clerkOrgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!isClub(org)) return false;
  const emails = await clerkUserEmails(clerkUserId);
  const client = await clerkClient();
  const invitations = await client.organizations.getOrganizationInvitationList({
    organizationId: clerkOrgId,
    status: ["pending", "accepted"],
    limit: 100,
  });
  return invitations.data.some((i) => emails.has(i.emailAddress.toLowerCase()) && isTrainerInvite(i));
}

/**
 * For the onboarding page when the webhook hasn't created the row yet: the
 * club (member-billed org) this Clerk user joined through a TRAINER invite.
 */
export async function resolveClubTrainerInvite(clerkUserId: string): Promise<Organization | null> {
  const client = await clerkClient();
  const [memberships, emails] = await Promise.all([
    client.users.getOrganizationMembershipList({ userId: clerkUserId }),
    clerkUserEmails(clerkUserId),
  ]);

  for (const membership of memberships.data) {
    const org = await prisma.organization.findUnique({ where: { clerkOrgId: membership.organization.id } });
    if (!isClub(org)) continue;
    if (isTrainerInvite(membership)) return org;
    const accepted = await client.organizations.getOrganizationInvitationList({
      organizationId: org.clerkOrgId,
      status: ["accepted"],
      limit: 100,
    });
    if (accepted.data.some((i) => emails.has(i.emailAddress.toLowerCase()) && isTrainerInvite(i))) return org;
  }
  return null;
}
