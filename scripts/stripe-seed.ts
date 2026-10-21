import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  maxNetworkRetries: 2,
});

const PLANS = [
  { name: "Starter", amount: 2900, key: "STARTER" },
  { name: "Pro", amount: 7900, key: "PRO" },
  { name: "Unlimited", amount: 14900, key: "UNLIMITED" },
] as const;

async function seed() {
  console.log("Seeding Stripe products and prices...\n");

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `metadata['inmotus_seed_key']:'${plan.key}'`,
    });

    let product: Stripe.Product;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`Product already exists: ${plan.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: `MIA Performance — ${plan.name}`,
        metadata: { inmotus_seed_key: plan.key },
      });
      console.log(`Created product: ${plan.name} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    let price: Stripe.Price;
    if (prices.data.length > 0) {
      price = prices.data[0];
      console.log(`Price already exists: $${plan.amount / 100}/mo (${price.id})`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amount,
        currency: "usd",
        recurring: { interval: "month" },
      });
      console.log(`Created price: $${plan.amount / 100}/mo (${price.id})`);
    }

    console.log(`  → STRIPE_PRICE_${plan.key}=${price.id}\n`);
  }

  console.log("Done! Copy the STRIPE_PRICE_* values above into your .env.local");
}

seed().catch(console.error);
