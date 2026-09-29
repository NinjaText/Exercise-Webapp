import type { OrgType } from "@prisma/client";

/**
 * The single place that knows what an org's type means. Every surface
 * (billing gate, nav, route guards, webhooks) reads capabilities from here —
 * nothing else compares against "CLUB".
 */

export interface OrgCapabilities {
  /** Who is charged: the trainer (TrainerSubscription) or each member (MemberSubscription). */
  billing: "trainer" | "member";
  /** Inbox, chat and voice notes. Clubs are self-guided — nobody answers. */
  messaging: boolean;
  checkIns: boolean;
  /**
   * Whether client activity (workout done, exercise notes, nutrition replies,
   * check-in submissions) notifies the coach. Club programs are owned by the
   * platform staff account, which must not be paged for every member workout.
   */
  coachNotifications: boolean;
}

/** Error returned by message/voice-note send actions when `messaging` is off. */
export const MESSAGING_UNAVAILABLE = "Messaging isn't available for your account.";

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
});

const CLUB_CAPABILITIES: OrgCapabilities = Object.freeze({
  billing: "member",
  messaging: false,
  checkIns: false,
  coachNotifications: false,
});

export function getOrgCapabilities(org: OrgLike): OrgCapabilities {
  return getOrgType(org) === "CLUB" ? { ...CLUB_CAPABILITIES } : { ...TRAINER_CAPABILITIES };
}

/** Route prefixes owned by each switchable capability. */
export const CAPABILITY_ROUTES = {
  messaging: "/messages",
  checkIns: "/check-ins",
} as const satisfies Record<"messaging" | "checkIns", string>;

/** Nav hrefs to drop for an org, in a stable order. */
export function hiddenNavHrefs(caps: OrgCapabilities): string[] {
  const hidden: string[] = [];
  if (!caps.messaging) hidden.push(CAPABILITY_ROUTES.messaging);
  if (!caps.checkIns) hidden.push(CAPABILITY_ROUTES.checkIns);
  return hidden;
}
