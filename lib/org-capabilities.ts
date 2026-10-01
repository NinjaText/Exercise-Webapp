import type { OrgType } from "@prisma/client";

/**
 * The single place that knows what an org's type means. Every surface
 * (billing gate, nav, route guards, webhooks) reads capabilities from here —
 * nothing else compares against "CLUB".
 */

export interface OrgCapabilities {
  /** Who is charged: the trainer (TrainerSubscription) or each member (MemberSubscription). */
  billing: "trainer" | "member";
  /** Inbox, chat and voice notes. Off for club members without active coaching. */
  messaging: boolean;
  checkIns: boolean;
  /**
   * Whether client activity (workout done, exercise notes, nutrition replies,
   * check-in submissions) notifies the coach. Uncoached club members have no
   * coach to page.
   */
  coachNotifications: boolean;
  /**
   * Trainer billing page/nav is shown (false for club trainers — they never
   * pay). Only meaningful for TRAINERs; clients have no trainer billing page,
   * so it stays true for them and their nav is unaffected.
   */
  trainerBilling: boolean;
}

/** Error returned by message/voice-note send actions when `messaging` is off. */
export const MESSAGING_UNAVAILABLE = "Messaging isn't available for your account.";

/** Error returned when a trainer assigns a check-in to a client without `checkIns`. */
export const CHECK_INS_UNAVAILABLE = "Check-ins aren't available for this client.";

type OrgLike = { type?: OrgType | null } | null | undefined;

/** Existing documents have no `type` key, so absence means TRAINER. */
export function getOrgType(org: OrgLike): OrgType {
  return org?.type ?? "TRAINER";
}

const TRAINER_CAPABILITIES: OrgCapabilities = Object.freeze({
  billing: "trainer",
  messaging: true,
  checkIns: true,
  coachNotifications: true,
  trainerBilling: true,
});

/**
 * One user's capabilities. Trainer orgs: everyone gets the full set. Clubs:
 * the club trainer coaches (but never pays); a member gets coaching features
 * only while their MemberCoaching is ACTIVE.
 */
export function getUserCapabilities(input: {
  orgType: OrgType;
  role: "TRAINER" | "CLIENT";
  coachingActive: boolean;
}): OrgCapabilities {
  if (input.orgType !== "CLUB") return { ...TRAINER_CAPABILITIES };
  const coached = input.role === "TRAINER" || input.coachingActive;
  return {
    billing: "member",
    messaging: coached,
    checkIns: coached,
    coachNotifications: coached,
    trainerBilling: input.role !== "TRAINER",
  };
}

/** Only a club member's capabilities depend on their MemberCoaching row. */
export function needsCoachingLookup(orgType: OrgType, role: "TRAINER" | "CLIENT"): boolean {
  return orgType === "CLUB" && role === "CLIENT";
}

/**
 * The pair rule — the single predicate behind canCoachInteract and
 * filterCoachableClientIds (lib/org-capabilities.server.ts). Both sides need
 * the capability. A member-billed (club) sender may only reach users in their
 * own org; a trainer-org sender keeps today's rules.
 */
export function canPairInteract(input: {
  sender: OrgCapabilities;
  recipient: OrgCapabilities;
  sameOrg: boolean;
  cap: "messaging" | "checkIns";
}): boolean {
  const { sender, recipient, sameOrg, cap } = input;
  if (!sender[cap] || !recipient[cap]) return false;
  return sender.billing !== "member" || sameOrg;
}

/**
 * Org-level default, for code with no user (webhooks, billing routing). For a
 * club this is an uncoached member's set; use getCapabilitiesForUser for users.
 */
export function getOrgCapabilities(org: OrgLike): OrgCapabilities {
  return getUserCapabilities({ orgType: getOrgType(org), role: "CLIENT", coachingActive: false });
}

/** Route prefixes owned by each switchable capability. */
export const CAPABILITY_ROUTES = {
  messaging: "/messages",
  checkIns: "/check-ins",
} as const satisfies Record<"messaging" | "checkIns", string>;

/** Trainer billing settings page, hidden when `trainerBilling` is off. */
export const TRAINER_BILLING_ROUTE = "/settings/billing";

/** Nav hrefs to drop for a user, in a stable order. */
export function hiddenNavHrefs(caps: OrgCapabilities): string[] {
  const hidden: string[] = [];
  if (!caps.messaging) hidden.push(CAPABILITY_ROUTES.messaging);
  if (!caps.checkIns) hidden.push(CAPABILITY_ROUTES.checkIns);
  if (!caps.trainerBilling) hidden.push(TRAINER_BILLING_ROUTE);
  return hidden;
}
