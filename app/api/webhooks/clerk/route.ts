import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { brandingTag } from "@/lib/services/branding.service";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { ensureMemberSubscription } from "@/lib/services/club-member.service";
import { applyPendingAssignmentsForNewClient } from "@/lib/services/pending-program-assignment.service";
import { deleteUserData, findDeletionBlockers } from "@/lib/services/user-deletion.service";
import type { InviteClientMetadata } from "@/actions/invite-client-action";

/**
 * Recovers the profile details a trainer entered when sending the invitation.
 *
 * Clerk copies an organization invitation's `public_metadata` onto the
 * resulting membership, so the membership event usually carries it directly.
 * That copy isn't something we control, though, so when the fields aren't on
 * the event we fall back to looking up the org's accepted invitations by email.
 * Both paths are best-effort: invites sent before this metadata existed simply
 * return nothing and the caller keeps today's Clerk-profile behaviour.
 */
async function resolveInviteMetadata(
  membershipPublicMetadata: unknown,
  orgId: string,
  email: string
): Promise<InviteClientMetadata> {
  const fromEvent = (membershipPublicMetadata ?? {}) as InviteClientMetadata;
  if (fromEvent.invitedFirstName || fromEvent.invitedLastName || fromEvent.invitedPhone) {
    return fromEvent;
  }

  try {
    const client = await clerkClient();
    const invitations = await client.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      status: ["accepted", "pending"],
      limit: 100,
    });
    const match = invitations.data.find(
      (invitation) => invitation.emailAddress.toLowerCase() === email.toLowerCase()
    );
    return (match?.publicMetadata ?? {}) as InviteClientMetadata;
  } catch (error) {
    console.error("Failed to look up organization invitation metadata:", error);
    return {};
  }
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      const user = await prisma.user.findUnique({ where: { clerkId: id }, select: { id: true } });
      if (user) {
        try {
          // `deleteUserData` deletes leaf-first and only hits the restrict on
          // the user row at the very end, so running it on a blocked user
          // destroys health data (messages, progress photos, clinical notes,
          // client profile) and *then* throws. Its contract is that callers
          // check blockers first; this one has to as well.
          const blockers = await findDeletionBlockers(user.id, { includeActiveClients: false });
          if (blockers.length > 0) {
            // Delete nothing. A retry would hit the identical state, so ack
            // with 200 rather than making Svix redeliver forever — this needs
            // a human, and the log line below is what they act on.
            console.error(
              "[clerk-webhook] user.deleted skipped: rows other users depend on",
              { userId: user.id, clerkId: id, blockers: blockers.map((b) => b.code) }
            );
            return new NextResponse("Blocked: manual cleanup required", { status: 200 });
          }
          await deleteUserData(user.id);
        } catch (error) {
          // A genuine failure (DB blip, timeout) — worth retrying, so signal
          // a non-2xx and let Svix redeliver.
          console.error("[clerk-webhook] user.deleted cleanup failed for", id, error);
          return new NextResponse("Cleanup failed", { status: 500 });
        }
      }
    }
  }

  if (evt.type === "user.updated") {
    const { id, image_url, email_addresses, primary_email_address_id } = evt.data;
    // The primary address, not the first one listed: a user who adds a second
    // email and makes it primary must not keep (or lose) the wrong one here.
    const primaryEmail =
      email_addresses?.find((e) => e.id === primary_email_address_id)?.email_address ??
      email_addresses?.[0]?.email_address;
    await prisma.user.updateMany({
      where: { clerkId: id },
      data: {
        imageUrl: image_url,
        ...(primaryEmail ? { email: primaryEmail } : {}),
      },
    });
  }

  if (evt.type === "organizationMembership.created") {
    const { organization, public_user_data, public_metadata } = evt.data as {
      organization: { id: string };
      public_user_data: { user_id: string };
      public_metadata?: unknown;
    };

    const clerkUserId = public_user_data.user_id;
    const orgId = organization.id;

    // Fetch full user details from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const primaryEmail =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (primaryEmail) {
      const inviteMetadata = await resolveInviteMetadata(public_metadata, orgId, primaryEmail);

      const upserted = await prisma.user.upsert({
        where: { clerkId: clerkUserId },
        update: {
          clerkOrgId: orgId,
          imageUrl: clerkUser.imageUrl,
          email: primaryEmail,
        },
        create: {
          clerkId: clerkUserId,
          email: primaryEmail,
          // Prefer what the trainer typed on the invitation, then whatever the
          // client filled in on their Clerk profile, then today's empty-string
          // fallback — so invites sent before invite metadata existed behave
          // exactly as they do now.
          firstName: inviteMetadata.invitedFirstName ?? clerkUser.firstName ?? "",
          lastName: inviteMetadata.invitedLastName ?? clerkUser.lastName ?? "",
          ...(inviteMetadata.invitedPhone ? { phone: inviteMetadata.invitedPhone } : {}),
          imageUrl: clerkUser.imageUrl,
          role: "CLIENT",
          clerkOrgId: orgId,
          onboarded: false,
        },
      });

      // Apply any programs the trainer queued for this email at invite time.
      // Best-effort: a failure here must not fail the webhook, or Clerk will
      // retry and re-run the account creation above.
      if (upserted.role === "CLIENT") {
        // Club orgs: make sure the member has a trial even if they reached the
        // org some way other than /join/[slug]/complete. Idempotent — never
        // resets an existing trial. Best-effort like the block below.
        try {
          const org = await prisma.organization.findUnique({ where: { clerkOrgId: orgId } });
          if (org && getOrgCapabilities(org).billing === "member") {
            await ensureMemberSubscription(upserted.id, org);
          }
        } catch (error) {
          console.error("Failed to ensure member subscription:", error);
        }

        try {
          const trainer = await prisma.user.findFirst({
            where: { clerkOrgId: orgId, role: "TRAINER" },
            select: { id: true },
          });
          if (trainer) {
            await applyPendingAssignmentsForNewClient(trainer.id, primaryEmail, upserted.id);
          }
        } catch (error) {
          console.error("Failed to apply pending program assignments:", error);
        }
      }
    }
  }

  if (evt.type === "organizationMembership.deleted") {
    const { public_user_data } = evt.data as {
      public_user_data: { user_id: string };
    };
    await prisma.user.updateMany({
      where: { clerkId: public_user_data.user_id },
      data: { clerkOrgId: null },
    });
  }

  // Keep the DB org profile's name in sync with renames made in Clerk.
  // updateMany so an org without a row yet is a no-op (it's lazily created).
  if (evt.type === "organization.updated") {
    const { id, name } = evt.data as { id: string; name?: unknown };
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (id && trimmed) {
      await prisma.organization.updateMany({
        where: { clerkOrgId: id },
        data: { name: trimmed },
      });
      // The name feeds the branded display name. updateTag throws outside a
      // Server Action, so a Route Handler uses revalidateTag (stale-while-
      // revalidate with the "max" profile).
      revalidateTag(brandingTag(id), "max");
    }
  }

  if (evt.type === "session.created" || evt.type === "session.ended") {
    const sessionData = evt.data as { user_id?: string };
    const clerkUserId = sessionData.user_id;

    if (clerkUserId) {
      const dbUser = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
      if (dbUser) {
        await logAudit({
          actorId: dbUser.id,
          actorType: deriveActorType(dbUser),
          actorName: `${dbUser.firstName} ${dbUser.lastName}`,
          action: evt.type === "session.created" ? AUDIT_ACTIONS.LOGIN : AUDIT_ACTIONS.LOGOUT,
          orgId: dbUser.clerkOrgId,
        });
      }
    }
  }

  return new NextResponse("OK", { status: 200 });
}
