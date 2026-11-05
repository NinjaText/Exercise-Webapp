import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2 });
const prisma = new PrismaClient();

async function bootstrap() {
  const trainers = await prisma.user.findMany({ where: { role: "TRAINER" } });
  console.log(`Found ${trainers.length} trainer(s)`);

  for (const trainer of trainers) {
    const existing = await prisma.trainerSubscription.findUnique({
      where: { trainerId: trainer.id },
    });
    if (existing) {
      console.log(`  ${trainer.email} — already has subscription (${existing.status}), skipping`);
      continue;
    }

    // Create Stripe Customer
    const customer = await stripe.customers.create({
      email: trainer.email,
      name: `${trainer.firstName} ${trainer.lastName}`,
      metadata: { trainerId: trainer.id },
    });

    // No local trial window: the 7-day trial now runs inside Stripe Checkout
    // (card required). The epoch marks "never checked out" (NO_LOCAL_TRIAL in
    // lib/billing/access.ts), so the gate sends them to choose a plan.
    const trialEndsAt = new Date(0);
    await prisma.trainerSubscription.create({
      data: {
        trainerId: trainer.id,
        stripeCustomerId: customer.id,
        status: "TRIALING",
        trialEndsAt,
      },
    });

    console.log(`  ${trainer.email} — created customer ${customer.id} + TrainerSubscription`);
  }

  await prisma.$disconnect();
  console.log("Done.");
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
