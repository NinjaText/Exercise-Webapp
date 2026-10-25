import "server-only";
import type { User } from "@prisma/client";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { PaymentsError } from "@/lib/payments/connect-errors";

type PaymentsUser = Pick<User, "id" | "role" | "clerkOrgId">;

/**
 * Trainer payments are a trainer-org feature only. Clubs bill members
 * through MemberSubscription, so a club's house coach and members never get
 * Connect surfaces — the nav hides them, and every service entry point calls
 * this so a direct URL or action call is refused too.
 */
export async function assertPaymentsAvailable(user: PaymentsUser): Promise<void> {
  const caps = await getCapabilitiesForUser(user);
  if (caps.billing !== "trainer") throw new PaymentsError("unavailable");
}

export async function arePaymentsAvailable(user: PaymentsUser): Promise<boolean> {
  const caps = await getCapabilitiesForUser(user);
  return caps.billing === "trainer";
}
