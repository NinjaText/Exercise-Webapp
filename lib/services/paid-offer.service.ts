import type Stripe from "stripe";
import type { PaidOffer, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { nullOrUnset } from "@/lib/db/mongo-null";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { getTrainersForClient } from "@/lib/services/client.service";
import { getChargeableAccount, getConnectedAccount } from "@/lib/services/connected-account.service";
import { assertPaymentsAvailable } from "@/lib/payments/payments-access";
import { PaymentsError } from "@/lib/payments/connect-errors";
import { CONNECT_PURCHASE_TYPE, OFFER_CURRENCY, type OfferKind } from "@/lib/payments/connect-config";
import type { CreateOfferInput, UpdateOfferInput } from "@/lib/validators/paid-offer";

/**
 * Paid offers (spec §3 "Offers"): what a trainer sells. Product and Price
 * live on the trainer's connected account (`{ stripeAccount }`), so Stripe
 * pricing is the source of truth for what is charged; the PaidOffer row
 * mirrors it for listing and links it to the program it unlocks.
 */

type Trainer = Pick<User, "id" | "role" | "clerkOrgId" | "email" | "firstName" | "lastName">;
type Client = Pick<User, "id" | "role" | "clerkOrgId">;

export interface TemplateOption {
  id: string;
  name: string;
  schedulingType: string | null;
}

export interface StoreOffer {
  id: string;
  kind: OfferKind;
  name: string;
  description: string | null;
  priceInCents: number;
  currency: string;
  cancellationPolicy: string;
  trainerId: string;
  trainerName: string;
  programName: string | null;
}

function assertTrainer(user: Trainer): void {
  if (user.role !== "TRAINER") throw new PaymentsError("forbidden");
}

function recurringFor(kind: string): { interval: "month" } | undefined {
  return kind === "COACHING" ? { interval: "month" } : undefined;
}

function priceIdOf(product: Stripe.Product): string {
  const price = product.default_price;
  const id = typeof price === "string" ? price : price?.id;
  if (!id) throw new Error(`Stripe product ${product.id} has no default price`);
  return id;
}

/** A program template the trainer owns (no client, not archived). */
async function requireOwnedTemplate(trainerId: string, programId: string): Promise<TemplateOption> {
  const program = await prisma.program.findFirst({
    where: { id: programId, trainerId, status: { not: "ARCHIVED" }, ...nullOrUnset("clientId") },
    select: { id: true, name: true, schedulingType: true },
  });
  if (!program) throw new PaymentsError("invalid_input", "Choose one of your program templates.");
  return program;
}

/** Templates offered in the "program this unlocks" picker. */
export async function listTemplateOptions(trainerId: string): Promise<TemplateOption[]> {
  return prisma.program.findMany({
    where: { trainerId, status: { not: "ARCHIVED" }, ...nullOrUnset("clientId") },
    select: { id: true, name: true, schedulingType: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function listOffersForTrainer(trainerId: string): Promise<PaidOffer[]> {
  return prisma.paidOffer.findMany({
    where: { trainerId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

async function requireOwnedOffer(trainerId: string, offerId: string): Promise<PaidOffer> {
  const offer = await prisma.paidOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.trainerId !== trainerId) throw new PaymentsError("not_found", "Offer not found.");
  return offer;
}

export async function createOffer(trainer: Trainer, input: CreateOfferInput): Promise<PaidOffer> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);

  const account = await getChargeableAccount(trainer.id);
  if (!account) throw new PaymentsError("charges_disabled");
  if (input.programTemplateId) await requireOwnedTemplate(trainer.id, input.programTemplateId);

  const stripeAccount = account.stripeAccountId;
  const product = await stripe.products.create(
    {
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      default_price_data: {
        currency: OFFER_CURRENCY,
        unit_amount: input.priceInCents,
        recurring: recurringFor(input.kind),
      },
      metadata: { purchaseType: CONNECT_PURCHASE_TYPE, trainerId: trainer.id, kind: input.kind },
    },
    { stripeAccount }
  );

  const offer = await prisma.paidOffer.create({
    data: {
      trainerId: trainer.id,
      stripeAccountId: stripeAccount,
      kind: input.kind,
      name: input.name,
      description: input.description,
      priceInCents: input.priceInCents,
      currency: OFFER_CURRENCY,
      programTemplateId: input.programTemplateId,
      cancellationPolicy: input.kind === "COACHING" ? input.cancellationPolicy : "END_OF_PERIOD",
      stripeProductId: product.id,
      stripePriceId: priceIdOf(product),
      isActive: true,
    },
  });

  await logUserAudit(trainer, () => ({
    action: AUDIT_ACTIONS.OFFER_CREATED,
    targetType: "PaidOffer",
    targetId: offer.id,
    targetLabel: offer.name,
    metadata: { kind: offer.kind, priceInCents: offer.priceInCents },
  }));
  return offer;
}

/**
 * Edits an active offer. Stripe prices are immutable, so a new amount
 * creates a new Price, makes it the product default, then deactivates the
 * old one (in that order — Stripe refuses to deactivate a default price).
 * Existing memberships stay on the price they signed up at.
 */
export async function updateOffer(trainer: Trainer, input: UpdateOfferInput): Promise<PaidOffer> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);

  const offer = await requireOwnedOffer(trainer.id, input.offerId);
  if (!offer.isActive) throw new PaymentsError("invalid_state", "Archived offers can't be edited.");
  const account = await getConnectedAccount(trainer.id);
  if (!account || account.disconnectedAt || account.stripeAccountId !== offer.stripeAccountId) {
    throw new PaymentsError("not_connected");
  }
  if (offer.kind === "PROGRAM" && !input.programTemplateId) {
    throw new PaymentsError("invalid_input", "Choose the program this purchase unlocks.");
  }
  if (input.programTemplateId && input.programTemplateId !== offer.programTemplateId) {
    await requireOwnedTemplate(trainer.id, input.programTemplateId);
  }

  const stripeAccount = offer.stripeAccountId;
  const changed: string[] = [];

  if (input.name !== offer.name || input.description !== offer.description) {
    await stripe.products.update(
      offer.stripeProductId,
      { name: input.name, description: input.description ?? "" },
      { stripeAccount }
    );
    if (input.name !== offer.name) changed.push("name");
    if (input.description !== offer.description) changed.push("description");
  }

  let stripePriceId = offer.stripePriceId;
  if (input.priceInCents !== offer.priceInCents) {
    const price = await stripe.prices.create(
      {
        product: offer.stripeProductId,
        currency: offer.currency,
        unit_amount: input.priceInCents,
        recurring: recurringFor(offer.kind),
        metadata: { purchaseType: CONNECT_PURCHASE_TYPE, trainerId: trainer.id },
      },
      { stripeAccount }
    );
    await stripe.products.update(offer.stripeProductId, { default_price: price.id }, { stripeAccount });
    await stripe.prices.update(offer.stripePriceId, { active: false }, { stripeAccount });
    stripePriceId = price.id;
    changed.push("price");
  }

  const cancellationPolicy = offer.kind === "COACHING" ? input.cancellationPolicy : offer.cancellationPolicy;
  if (cancellationPolicy !== offer.cancellationPolicy) changed.push("cancellationPolicy");
  if (input.programTemplateId !== offer.programTemplateId) changed.push("program");

  const updated = await prisma.paidOffer.update({
    where: { id: offer.id },
    data: {
      name: input.name,
      description: input.description,
      priceInCents: input.priceInCents,
      stripePriceId,
      programTemplateId: input.programTemplateId,
      cancellationPolicy,
    },
  });

  if (changed.length > 0) {
    await logUserAudit(trainer, () => ({
      action: AUDIT_ACTIONS.OFFER_UPDATED,
      targetType: "PaidOffer",
      targetId: offer.id,
      targetLabel: updated.name,
      metadata: { changed, ...(changed.includes("price") ? { from: offer.priceInCents, to: updated.priceInCents } : {}) },
    }));
  }
  return updated;
}

/**
 * Stops selling an offer. Archives the Stripe product when the account is
 * still connected (a disconnected account can't be reached, so the archive
 * is local only). Existing memberships are not canceled.
 */
export async function archiveOffer(trainer: Trainer, offerId: string): Promise<PaidOffer> {
  assertTrainer(trainer);
  await assertPaymentsAvailable(trainer);

  const offer = await requireOwnedOffer(trainer.id, offerId);
  if (!offer.isActive) return offer;

  const account = await getConnectedAccount(trainer.id);
  if (account && !account.disconnectedAt && account.stripeAccountId === offer.stripeAccountId) {
    await stripe.products.update(offer.stripeProductId, { active: false }, { stripeAccount: offer.stripeAccountId });
  }

  const updated = await prisma.paidOffer.update({ where: { id: offer.id }, data: { isActive: false } });
  await logUserAudit(trainer, () => ({
    action: AUDIT_ACTIONS.OFFER_ARCHIVED,
    targetType: "PaidOffer",
    targetId: offer.id,
    targetLabel: offer.name,
  }));
  return updated;
}

function displayName(u: Pick<User, "firstName" | "lastName" | "email">): string {
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

/**
 * What a client can buy: active offers from their own trainer(s) whose
 * account can take payments right now. Offers tied to an account the
 * trainer has since replaced are skipped.
 */
export async function listStoreOffers(client: Client): Promise<StoreOffer[]> {
  if (client.role !== "CLIENT") return [];
  await assertPaymentsAvailable(client);

  const trainers = await getTrainersForClient(client.id);
  if (trainers.length === 0) return [];

  const accounts = await prisma.connectedAccount.findMany({
    where: { trainerId: { in: trainers.map((t) => t.id) }, chargesEnabled: true, ...nullOrUnset("disconnectedAt") },
    select: { trainerId: true, stripeAccountId: true },
  });
  if (accounts.length === 0) return [];
  const accountByTrainer = new Map(accounts.map((a) => [a.trainerId, a.stripeAccountId]));

  const offers = await prisma.paidOffer.findMany({
    where: { trainerId: { in: [...accountByTrainer.keys()] }, isActive: true },
    orderBy: [{ kind: "asc" }, { priceInCents: "asc" }],
  });
  const sellable = offers.filter((o) => accountByTrainer.get(o.trainerId) === o.stripeAccountId);

  const templateIds = [...new Set(sellable.map((o) => o.programTemplateId).filter((id): id is string => !!id))];
  const templates = templateIds.length
    ? await prisma.program.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } })
    : [];
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const trainerById = new Map(trainers.map((t) => [t.id, t]));

  return sellable.map((o) => {
    const trainer = trainerById.get(o.trainerId);
    return {
      id: o.id,
      kind: o.kind as OfferKind,
      name: o.name,
      description: o.description,
      priceInCents: o.priceInCents,
      currency: o.currency,
      cancellationPolicy: o.cancellationPolicy,
      trainerId: o.trainerId,
      trainerName: trainer ? displayName(trainer) : "Your coach",
      programName: o.programTemplateId ? (templateName.get(o.programTemplateId) ?? null) : null,
    };
  });
}
