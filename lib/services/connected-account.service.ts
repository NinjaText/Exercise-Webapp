import type Stripe from "stripe";
import type { ConnectedAccount, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { stripe } from "@/lib/stripe";
import { appBaseUrl } from "@/lib/utils/app-url";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { assertPaymentsAvailable } from "@/lib/payments/payments-access";
import { PaymentsError } from "@/lib/payments/connect-errors";
import { isConnectOAuthEnabled, LIVE_READ_REQUEST_OPTIONS } from "@/lib/payments/connect-config";
import { withLiveReadDeadline } from "@/lib/payments/live-read";
import { signConnectOAuthState, verifyConnectOAuthState } from "@/lib/payments/connect-oauth-state";
import { endMembershipsForAccount } from "@/lib/services/offer-subscription.service";

/**
 * A trainer's Stripe Connect account (spec §3 "Accounts"). MIA never holds
 * the money: every charge is a direct charge on this account, and the
 * trainer manages payouts, disputes and refunds in their own full Stripe
 * Dashboard. The ConnectedAccount row only mirrors the flags the app needs.
 */

type Trainer = Pick<User, "id" | "role" | "clerkOrgId" | "email" | "firstName" | "lastName">;

export type ConnectStatus = "NOT_CONNECTED" | "ONBOARDING" | "RESTRICTED" | "ACTIVE" | "DISCONNECTED";

export interface ConnectOverview {
  account: ConnectedAccount | null;
  status: ConnectStatus;
  /** Live from Stripe; empty when the read failed or nothing is due. */
  requirementsDue: string[];
  disabledReason: string | null;
  /** Set when the live Stripe read failed; the row's last known flags are shown instead. */
  liveError: string | null;
}

const ONBOARDING_RETURN_PATH = "/payments?onboarding=return";
const ONBOARDING_REFRESH_PATH = "/payments/onboarding";
export const OAUTH_CALLBACK_PATH = "/payments/oauth/callback";

function assertTrainer(user: Trainer): void {
  if (user.role !== "TRAINER") throw new PaymentsError("forbidden");
}

export async function getConnectedAccount(trainerId: string): Promise<ConnectedAccount | null> {
  return prisma.connectedAccount.findUnique({ where: { trainerId } });
}

/** The trainer's account if it can take payments right now, else null. */
export async function getChargeableAccount(trainerId: string): Promise<ConnectedAccount | null> {
  const account = await getConnectedAccount(trainerId);
  if (!account || account.disconnectedAt || !account.chargesEnabled) return null;
  return account;
}

export function deriveConnectStatus(account: ConnectedAccount | null): ConnectStatus {
  if (!account) return "NOT_CONNECTED";
  if (account.disconnectedAt) return "DISCONNECTED";
  if (account.chargesEnabled) return "ACTIVE";
  return account.detailsSubmitted ? "RESTRICTED" : "ONBOARDING";
}

function flagsFromStripe(account: Stripe.Account) {
  return {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
  };
}

function flagsChanged(row: ConnectedAccount, next: ReturnType<typeof flagsFromStripe>): boolean {
  return (
    row.chargesEnabled !== next.chargesEnabled ||
    row.payoutsEnabled !== next.payoutsEnabled ||
    row.detailsSubmitted !== next.detailsSubmitted ||
    row.country !== next.country ||
    row.defaultCurrency !== next.defaultCurrency
  );
}

/**
 * Mirrors a Stripe Account onto its row (the `account.updated` webhook and
 * the /payments page refresh both land here). Unknown accounts are ignored;
 * a disconnected row is left alone so a late event can't revive it.
 * Returns the row, or null when the account isn't one of ours.
 */
export async function syncConnectedAccountFromStripe(account: Stripe.Account): Promise<ConnectedAccount | null> {
  const row = await prisma.connectedAccount.findUnique({ where: { stripeAccountId: account.id } });
  if (!row) return null;
  if (row.disconnectedAt) return row;
  const next = flagsFromStripe(account);
  if (!flagsChanged(row, next)) return row;
  return prisma.connectedAccount.update({ where: { id: row.id }, data: next });
}

/**
 * The /payments status card: the row plus a live read of requirements.
 * Fails soft — a Stripe outage shows the last known state with an inline note.
 */
export async function getConnectOverview(trainer: Trainer): Promise<ConnectOverview> {
  let account = await getConnectedAccount(trainer.id);
  const base: ConnectOverview = {
    account,
    status: deriveConnectStatus(account),
    requirementsDue: [],
    disabledReason: null,
    liveError: null,
  };
  if (!account || account.disconnectedAt) return base;

  try {
    const live = await withLiveReadDeadline(
      stripe.accounts.retrieve(account.stripeAccountId, {}, LIVE_READ_REQUEST_OPTIONS)
    );
    account = (await syncConnectedAccountFromStripe(live)) ?? account;
    const due = new Set([...(live.requirements?.past_due ?? []), ...(live.requirements?.currently_due ?? [])]);
    return {
      account,
      status: deriveConnectStatus(account),
      requirementsDue: [...due],
      disabledReason: live.requirements?.disabled_reason ?? null,
      liveError: null,
    };
  } catch (err) {
    console.error(`[payments] live account read failed for trainer ${trainer.id}:`, err);
    return { ...base, liveError: "Couldn't reach Stripe to refresh your account status." };
  }
}

async function createAccountLink(stripeAccountId: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    refresh_url: `${appBaseUrl()}${ONBOARDING_REFRESH_PATH}`,
    return_url: `${appBaseUrl()}${ONBOARDING_RETURN_PATH}`,
  });
  return link.url;
}

/**
 * Starts (or continues) onboarding through MIA. Creates the connected
 * account on first use — a Standard-like account the trainer fully owns:
 * they get the full Stripe Dashboard, pay Stripe's fees themselves, and Stripe
 * (not MIA) carries negative-balance losses and collects requirements. A
 * trainer with an existing Stripe login can sign in to it during onboarding.
 * Returns the hosted onboarding URL.
 */
export async function startConnectOnboarding(trainer: Trainer): Promise<string> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);

  const existing = await getConnectedAccount(trainer.id);
  if (existing && !existing.disconnectedAt) {
    return createAccountLink(existing.stripeAccountId);
  }

  const account = await stripe.accounts.create({
    email: trainer.email,
    controller: {
      stripe_dashboard: { type: "full" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
    },
    metadata: { trainerId: trainer.id, source: "mia" },
  });

  await saveAccountForTrainer(trainer, account, "CREATED");
  return createAccountLink(account.id);
}

/**
 * For the onboarding refresh URL (an expired or reused Account Link): mints
 * a fresh link for the trainer's existing account. Never creates an account,
 * so it is safe as a plain GET.
 */
export async function refreshOnboardingLink(trainer: Trainer): Promise<string | null> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);
  const existing = await getConnectedAccount(trainer.id);
  if (!existing || existing.disconnectedAt) return null;
  return createAccountLink(existing.stripeAccountId);
}

/** Upserts the trainer's row (a reconnect after a disconnect reuses it) and audits the connect. */
async function saveAccountForTrainer(
  trainer: Trainer,
  account: Stripe.Account,
  onboardingMethod: "CREATED" | "OAUTH"
): Promise<ConnectedAccount> {
  const owner = await prisma.connectedAccount.findUnique({ where: { stripeAccountId: account.id } });
  if (owner && owner.trainerId !== trainer.id) throw new PaymentsError("account_in_use");

  const data = {
    stripeAccountId: account.id,
    onboardingMethod,
    ...flagsFromStripe(account),
    // Explicit null (not omitted): Mongo `{ disconnectedAt: null }` filters skip absent fields.
    disconnectedAt: null,
  };
  const row = await prisma.connectedAccount.upsert({
    where: { trainerId: trainer.id },
    create: { trainerId: trainer.id, ...data },
    update: data,
  });

  await logUserAudit(trainer, () => ({
    action: AUDIT_ACTIONS.PAYMENT_ACCOUNT_CONNECTED,
    targetType: "ConnectedAccount",
    targetId: row.id,
    targetLabel: account.id,
    metadata: { method: onboardingMethod },
  }));
  return row;
}

/** The Standard OAuth URL for "connect an existing Stripe account". */
export async function getConnectOAuthUrl(trainer: Trainer): Promise<string> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);
  if (!isConnectOAuthEnabled()) throw new PaymentsError("oauth_disabled");

  const existing = await getConnectedAccount(trainer.id);
  if (existing && !existing.disconnectedAt) throw new PaymentsError("invalid_state", "You already have a connected Stripe account.");

  return stripe.oauth.authorizeUrl({
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
    response_type: "code",
    scope: "read_write",
    redirect_uri: `${appBaseUrl()}${OAUTH_CALLBACK_PATH}`,
    state: signConnectOAuthState(trainer.id),
    stripe_user: { email: trainer.email },
  });
}

/**
 * OAuth callback: the signed `state` must belong to this exact signed-in
 * trainer (CSRF). Exchanges the code and links the returned account.
 */
export async function completeConnectOAuth(trainer: Trainer, code: string, state: string | null): Promise<ConnectedAccount> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);
  if (!isConnectOAuthEnabled()) throw new PaymentsError("oauth_disabled");
  if (!verifyConnectOAuthState(state, trainer.id)) {
    throw new PaymentsError("forbidden", "This Stripe connection link has expired. Please start again.");
  }

  const token = await stripe.oauth.token({ grant_type: "authorization_code", code });
  if (!token.stripe_user_id) throw new Error("Stripe OAuth returned no account id");

  // Never orphan a live account (its memberships and webhooks): the trainer
  // must disconnect it first. Re-checked here, not just when the URL was built.
  const existing = await getConnectedAccount(trainer.id);
  if (existing && !existing.disconnectedAt && existing.stripeAccountId !== token.stripe_user_id) {
    throw new PaymentsError("invalid_state", "Disconnect your current Stripe account before connecting another one.");
  }

  const account = await stripe.accounts.retrieve(token.stripe_user_id);
  return saveAccountForTrainer(trainer, account, "OAUTH");
}

/** Shared by the trainer's own disconnect and Stripe's deauthorization event. */
async function markDisconnected(row: ConnectedAccount): Promise<boolean> {
  const { count } = await prisma.connectedAccount.updateMany({
    where: { id: row.id, ...nullOrUnset("disconnectedAt") },
    data: { disconnectedAt: new Date(), chargesEnabled: false, payoutsEnabled: false },
  });
  // Offers can't be bought without a live account. Products stay on the
  // trainer's Stripe account (they own it); only MIA stops selling them.
  await prisma.paidOffer.updateMany({
    where: { trainerId: row.trainerId, stripeAccountId: row.stripeAccountId, isActive: true },
    data: { isActive: false },
  });
  return count === 1;
}

/**
 * An account is "ours" if it is a trainer's current ConnectedAccount or one
 * they used before (offers, and so purchases/memberships, keep its id after
 * the trainer reconnects a different account). Webhook events for a previous
 * account must still be handled, or its refunds and cancellations would
 * never revoke access.
 */
export async function isKnownConnectAccount(stripeAccountId: string): Promise<boolean> {
  const current = await prisma.connectedAccount.findUnique({ where: { stripeAccountId }, select: { id: true } });
  if (current) return true;
  const offer = await prisma.paidOffer.findFirst({ where: { stripeAccountId }, select: { id: true } });
  return offer !== null;
}

/**
 * `account.application.deauthorized`: the trainer revoked MIA's access from
 * their Stripe Dashboard. No further events arrive for that account, so its
 * live memberships are ended in MIA (programs paused) and its offers hidden.
 * Works for a previous account too. Idempotent.
 */
export async function handleAccountDeauthorized(stripeAccountId: string): Promise<boolean> {
  await prisma.paidOffer.updateMany({ where: { stripeAccountId, isActive: true }, data: { isActive: false } });
  const ended = await endMembershipsForAccount(stripeAccountId);
  if (ended > 0) console.warn(`[payments] ${stripeAccountId} deauthorized; ended ${ended} membership(s) in MIA`);

  const row = await prisma.connectedAccount.findUnique({ where: { stripeAccountId } });
  if (!row) return ended > 0;
  const changed = await markDisconnected(row);
  if (changed) {
    const trainer = await prisma.user.findUnique({ where: { id: row.trainerId } });
    if (trainer) {
      await logUserAudit(trainer, () => ({
        action: AUDIT_ACTIONS.PAYMENT_ACCOUNT_DISCONNECTED,
        targetType: "ConnectedAccount",
        targetId: row.id,
        targetLabel: stripeAccountId,
        metadata: { source: "stripe_deauthorized" },
      }));
    }
  }
  return true;
}

/**
 * The trainer disconnects from /payments. Revokes MIA's platform access when
 * OAuth is configured (best-effort — the local disconnect is what stops
 * sales). If access was revoked, MIA gets no more events for the account,
 * so its live memberships are ended in MIA and their programs paused;
 * otherwise they keep billing and syncing on the trainer's own account. The
 * UI says so before confirming.
 */
export async function disconnectConnectedAccount(trainer: Trainer): Promise<void> {
  assertTrainer(trainer);
  const row = await getConnectedAccount(trainer.id);
  if (!row || row.disconnectedAt) return;

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  let revoked = false;
  if (clientId) {
    try {
      await stripe.oauth.deauthorize({ client_id: clientId, stripe_user_id: row.stripeAccountId });
      revoked = true;
    } catch (err) {
      console.warn(`[payments] oauth.deauthorize failed for ${row.stripeAccountId}; disconnecting locally only:`, err);
    }
  }

  await markDisconnected(row);
  if (revoked) await endMembershipsForAccount(row.stripeAccountId);
  await logUserAudit(trainer, () => ({
    action: AUDIT_ACTIONS.PAYMENT_ACCOUNT_DISCONNECTED,
    targetType: "ConnectedAccount",
    targetId: row.id,
    targetLabel: row.stripeAccountId,
    metadata: { source: "trainer" },
  }));
}
