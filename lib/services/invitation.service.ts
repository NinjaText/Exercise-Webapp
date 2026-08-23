import { clerkClient } from "@clerk/nextjs/server";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface OrgInvitation {
  id: string;
  email: string;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number;
}

export async function getOrgInvitations(clerkOrgId: string): Promise<OrgInvitation[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationInvitationList({
    organizationId: clerkOrgId,
    limit: 100,
  });

  return data
    .map((invite) => ({
      id: invite.id,
      email: invite.emailAddress,
      status: (invite.status ?? "pending") as InvitationStatus,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}
