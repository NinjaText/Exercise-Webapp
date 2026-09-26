import { cache } from "react";
import { clerkClient } from "@clerk/nextjs/server";
import type { ProgramPurchase } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateProgram, assignProgram } from "@/lib/services/program.service";
import { sendProgramWelcomeEmail } from "@/lib/email/send-program-welcome";

export interface FulfillSessionInput {
  id: string;
  email: string | null;
  amountTotal: number | null;
  currency: string | null;
  packageIds: string[];
}

/**
 * `React.cache()`-wrapped so the sales success page's `generateMetadata`
 * (which only needs `orgId` for branding) and its page body (which needs the
 * full row for claim/pending status) share one DB read per request instead
 * of two.
 */
export const getPurchaseBySessionId = cache(
  async (sessionId: string): Promise<ProgramPurchase | null> => {
    return prisma.programPurchase.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
    });
  }
);

export async function fulfillProgramPurchase(
  session: FulfillSessionInput
): Promise<{ clerkUserId: string } | null> {
  // 1. Idempotency
  const existing = await prisma.programPurchase.findUnique({
    where: { stripeCheckoutSessionId: session.id },
  });
  if (existing?.status === "COMPLETED") return null;

  const email = session.email?.trim().toLowerCase();
  if (!email) throw new Error("Checkout session has no buyer email");
  if (session.packageIds.length === 0) throw new Error("No packages in session metadata");

  // 2. Load packages (source of truth for template + trainer + price)
  const packages = await prisma.coachPackage.findMany({
    where: { id: { in: session.packageIds } },
  });
  if (packages.length === 0) throw new Error("Purchased packages not found");
  const trainerId = packages[0].trainerId;

  const trainer = await prisma.user.findUnique({ where: { id: trainerId } });
  if (!trainer?.clerkOrgId) throw new Error("Selling trainer has no organization");
  const orgId = trainer.clerkOrgId;

  // 3. Ensure a pending purchase row exists (created once; reused on retry)
  if (!existing) {
    await prisma.programPurchase.create({
      data: {
        stripeCheckoutSessionId: session.id,
        buyerEmail: email,
        trainerId,
        orgId,
        packageIds: session.packageIds,
        amountInCents: session.amountTotal ?? 0,
        currency: session.currency ?? "usd",
        status: "PENDING",
      },
    });
  }

  // 4. Resolve or create the buyer (Clerk + DB), idempotently
  const clerk = await clerkClient();
  const dbExisting = await prisma.user.findUnique({ where: { email } });
  const isNewAccount = !dbExisting;

  let clerkUserId = dbExisting?.clerkId ?? null;
  let clerkFirstName = dbExisting?.firstName ?? undefined;

  if (!clerkUserId) {
    const found = await clerk.users.getUserList({ emailAddress: [email] });
    if (found.data.length > 0) {
      clerkUserId = found.data[0].id;
      clerkFirstName = found.data[0].firstName ?? undefined;
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [email],
        skipPasswordRequirement: true,
      });
      clerkUserId = created.id;
      clerkFirstName = created.firstName ?? undefined;
    }
  }

  // Ensure org membership. Skip entirely if the buyer is already in this org
  // (avoids an unnecessary Clerk call and its membership-quota consumption).
  // Otherwise ignore "already a member" errors from Clerk; rethrow anything else.
  if (dbExisting?.clerkOrgId !== orgId) {
    try {
      await clerk.organizations.createOrganizationMembership({
        organizationId: orgId,
        userId: clerkUserId,
        role: "org:member",
      });
    } catch (err: unknown) {
      const alreadyMember =
        !!err && typeof err === "object" && "errors" in err &&
        Array.isArray((err as { errors?: unknown }).errors) &&
        (err as { errors: Array<{ code?: string; message?: string }> }).errors.some(
          (e) =>
            (typeof e?.code === "string" && e.code.includes("already_a_member")) ||
            (typeof e?.message === "string" && /already a member/i.test(e.message))
        );
      if (!alreadyMember) throw err;
    }
  }

  // Upsert DB user as an onboarded CLIENT in the trainer's org
  const dbUser = await prisma.user.upsert({
    where: { email },
    update: { clerkId: clerkUserId, clerkOrgId: orgId, onboarded: true },
    create: {
      clerkId: clerkUserId,
      email,
      firstName: clerkFirstName ?? "",
      lastName: "",
      role: "CLIENT",
      clerkOrgId: orgId,
      onboarded: true,
    },
  });

  // Minimal profile so the client onboarding wizard is skipped
  await prisma.clientProfile.upsert({
    where: { userId: dbUser.id },
    update: {},
    create: { userId: dbUser.id },
  });

  // 5. Clone each template and assign the copy (idempotent across retries:
  //    reuse a program already cloned+assigned to this buyer from a prior run)
  const startDate = new Date();
  const assignedProgramIds: string[] = [];
  const skippedPackageIds: string[] = [];
  let newAssignments = 0;
  for (const pkg of packages) {
    if (!pkg.programTemplateId) {
      console.warn(
        `fulfillProgramPurchase: package ${pkg.id} has no programTemplateId; skipping`,
        { sessionId: session.id }
      );
      skippedPackageIds.push(pkg.id);
      continue;
    }
    const existingCopy = await prisma.program.findFirst({
      where: { sourceTemplateId: pkg.programTemplateId, clientId: dbUser.id },
      select: { id: true },
    });
    if (existingCopy) {
      assignedProgramIds.push(existingCopy.id);
      continue;
    }
    const copy = await duplicateProgram(pkg.programTemplateId, trainerId, false);
    await assignProgram(copy.id, dbUser.id, startDate);
    assignedProgramIds.push(copy.id);
    newAssignments += 1;
  }

  // 6. Complete the purchase record
  await prisma.programPurchase.update({
    where: { stripeCheckoutSessionId: session.id },
    data: {
      status: "COMPLETED",
      buyerUserId: dbUser.id,
      buyerClerkId: clerkUserId,
      assignedProgramIds,
    },
  });

  // 7. Welcome email — only when something new happened this run (avoids a
  //    duplicate email on an idempotent retry that assigned nothing new)
  if (newAssignments > 0 || isNewAccount) {
    const programName = packages.map((p) => p.name).join(" + ");
    await sendProgramWelcomeEmail({
      to: email,
      firstName: dbUser.firstName || undefined,
      programName,
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/p/${packages[0].slug}/success?session_id=${session.id}`,
      isNewAccount,
      clerkOrgId: orgId,
    });
  }

  return { clerkUserId };
}

/**
 * Retries any ProgramPurchase left in a non-terminal state (PENDING or
 * FAILED) after fulfillment normally runs in the background (see the
 * `checkout.session.completed` webhook handler, which acks Stripe
 * immediately via `after()` rather than blocking on the ~seconds-long
 * account-creation + program-clone work). A grace period excludes rows still
 * being processed by their original in-flight run.
 *
 * Intended to be called by a scheduled cron job. Safe to run repeatedly:
 * fulfillProgramPurchase is idempotent per purchase.
 */
export async function retryStuckProgramPurchases(
  graceMs = 5 * 60 * 1000
): Promise<{ retried: number; succeeded: number; failed: number }> {
  const stuck = await prisma.programPurchase.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      createdAt: { lt: new Date(Date.now() - graceMs) },
    },
  });

  let succeeded = 0;
  let failed = 0;
  for (const purchase of stuck) {
    try {
      await fulfillProgramPurchase({
        id: purchase.stripeCheckoutSessionId,
        email: purchase.buyerEmail,
        amountTotal: purchase.amountInCents,
        currency: purchase.currency,
        packageIds: purchase.packageIds,
      });
      succeeded += 1;
    } catch (err) {
      console.error(
        `retryStuckProgramPurchases: retry failed for session ${purchase.stripeCheckoutSessionId}`,
        err
      );
      await prisma.programPurchase
        .updateMany({
          where: { id: purchase.id, status: { not: "COMPLETED" } },
          data: { status: "FAILED" },
        })
        .catch(() => {});
      failed += 1;
    }
  }

  return { retried: stuck.length, succeeded, failed };
}
