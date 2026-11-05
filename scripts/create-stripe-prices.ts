/**
 * Creates (or finds) the 2026-11 MIA Performance Stripe products and monthly
 * USD prices. Trainer checkout finds them by lookup key (no env vars).
 *
 *   npx tsx scripts/create-stripe-prices.ts --dry-run   # no Stripe calls
 *   STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/create-stripe-prices.ts
 *
 * Idempotent: each product has a fixed id and each price a lookup_key, so a
 * re-run reuses what exists. If a price with that lookup_key exists at a
 * different amount, a new price is created and the lookup_key moves to it
 * (transfer_lookup_key); the old price is left as is (existing subscribers
 * stay on it).
 */
import Stripe from "stripe";

type PlanSpec = {
  productId: string;
  productName: string;
  lookupKey: string;
  amount: number;
  note: string;
};

export const PLANS: PlanSpec[] = [
  {
    productId: "mia_trainer_starter",
    productName: "MIA Performance — Trainer Starter",
    lookupKey: "mia_trainer_starter_monthly_v2",
    amount: 3999,
    note: "Trainer Starter (1–10 active clients)",
  },
  {
    productId: "mia_trainer_growth",
    productName: "MIA Performance — Trainer Growth",
    lookupKey: "mia_trainer_growth_monthly_v2",
    amount: 7999,
    note: "Trainer Growth (11–30 active clients)",
  },
  {
    productId: "mia_trainer_pro",
    productName: "MIA Performance — Trainer Pro",
    lookupKey: "mia_trainer_pro_monthly_v2",
    amount: 19700,
    note: "Trainer Pro (31–150 active clients)",
  },
  {
    productId: "mia_individual_starter",
    productName: "MIA Performance — Individual Starter",
    lookupKey: "mia_individual_starter_monthly_v1",
    amount: 3999,
    note: "Individual Starter (MIA Individuals club)",
  },
];

async function ensureProduct(stripe: Stripe, plan: PlanSpec): Promise<Stripe.Product> {
  try {
    const existing = await stripe.products.retrieve(plan.productId);
    if (!existing.active) return stripe.products.update(plan.productId, { active: true });
    return existing;
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
    return stripe.products.create({
      id: plan.productId,
      name: plan.productName,
      metadata: { mia_price_key: plan.lookupKey },
    });
  }
}

async function ensurePrice(stripe: Stripe, plan: PlanSpec, productId: string): Promise<{ price: Stripe.Price; created: boolean }> {
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
  const current = found.data[0];
  const matches =
    current &&
    current.active &&
    current.unit_amount === plan.amount &&
    current.currency === "usd" &&
    current.recurring?.interval === "month" &&
    current.recurring.interval_count === 1;
  if (matches) return { price: current, created: false };
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: plan.amount,
    recurring: { interval: "month" },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: Boolean(current),
    metadata: { mia_price_key: plan.lookupKey },
  });
  return { price, created: true };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

  if (dryRun) {
    console.log("DRY RUN — no Stripe calls. Would ensure:\n");
    for (const p of PLANS) {
      console.log(`  product ${p.productId} "${p.productName}"`);
      console.log(`    price ${usd(p.amount)}/month USD, lookup_key=${p.lookupKey}`);
    }
    console.log("\nRe-run without --dry-run (with a TEST key first) to create them.");
    return;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  console.log(`Using a ${/_live_/.test(key) ? "LIVE" : "test"} Stripe key.\n`);
  const stripe = new Stripe(key, { maxNetworkRetries: 2 });

  for (const plan of PLANS) {
    const product = await ensureProduct(stripe, plan);
    const { price, created } = await ensurePrice(stripe, plan, product.id);
    console.log(`${created ? "Created" : "Found  "} ${plan.note}: ${usd(plan.amount)}/mo → ${price.id}`);
  }

  console.log(
    "\nDone. Trainer checkout finds these prices in Stripe by lookup key — no env vars to set.\n" +
      "The Individual Starter price id above goes into the MIA Individuals club's price in Admin → Clubs.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
