import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { logAudit, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { applyPendingAssignmentsForNewClient } from "@/lib/services/pending-program-assignment.service";
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
      await prisma.user.deleteMany({ where: { clerkId: id } });
    }
  }

  if (evt.type === "user.updated") {
    const { id, image_url, email_addresses } = evt.data;
    const primaryEmail = email_addresses?.[0]?.email_address;
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
