"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ORG_MEMBER_LIMIT } from "@/lib/clerk-org-limits";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { logUserAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";

export async function completeTrainerOnboarding(data: {
  firstName: string;
  lastName: string;
  organizationName: string;
  phone?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const clerkUser = await currentUser();
  if (!clerkUser) return { success: false as const, error: "User not found" };

  // Club house coaches and club members belong to a member-billed org: this action
  // must never turn them into a trainer-org trainer with a new org and trial.
  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing && (await getCapabilitiesForUser(existing)).billing === "member") {
    return { success: false as const, error: "This account already belongs to a club." };
  }

  try {
    const organizationName = data.organizationName.trim();

    // A previous attempt can fail after the org exists (e.g. Stripe down while
    // creating the customer). Reuse that org so a retry doesn't make a second one.
    const previousOrg =
      existing?.role === "TRAINER" && existing.clerkOrgId
        ? await prisma.organization.findUnique({ where: { clerkOrgId: existing.clerkOrgId } })
        : null;

    let orgId: string;
    if (previousOrg) {
      orgId = previousOrg.clerkOrgId;
    } else {
      const client = await clerkClient();
      const org = await client.organizations.createOrganization({
        name: organizationName,
        createdBy: userId,
        maxAllowedMemberships: ORG_MEMBER_LIMIT,
      });
      orgId = org.id;

      // The DB Organization row is the canonical org profile.
      await prisma.organization.create({
        data: { clerkOrgId: orgId, name: organizationName },
      });
    }

    // `onboarded` is only set once the trial subscription exists (below): a
    // trainer without one would otherwise be locked out on "trial ended".
    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        role: "TRAINER",
        phone: data.phone ?? null,
        clerkOrgId: orgId,
      },
      create: {
        clerkId: userId,
        email: clerkUser.emailAddresses[0].emailAddress,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "TRAINER",
        phone: data.phone ?? null,
        imageUrl: clerkUser.imageUrl,
        clerkOrgId: orgId,
        onboarded: false,
      },
    });

    // Idempotent: skip if subscription record already exists
    const existingSub = await prisma.trainerSubscription.findUnique({
      where: { trainerId: user.id },
    });

    if (!existingSub) {
      const customer = await stripe.customers.create({
        email: clerkUser.emailAddresses[0].emailAddress,
        name: `${data.firstName} ${data.lastName}`,
        metadata: { trainerId: user.id },
      });

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      await prisma.trainerSubscription.create({
        data: {
          trainerId: user.id,
          stripeCustomerId: customer.id,
          status: "TRIALING",
          trialEndsAt,
        },
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { onboarded: true } });

    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.ONBOARDING_COMPLETED,
      targetType: "Organization",
      targetId: orgId,
      targetLabel: organizationName,
    }));
  } catch (err) {
    console.error("Failed to complete trainer onboarding:", err);
    return { success: false as const, error: "Failed to set up organization. Please try again." };
  }

  redirect("/dashboard");
}

export async function completeClientOnboarding(data: {
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  limitations?: string;
  comorbidities?: string;
  functionalChallenges?: string;
  availableEquipment?: string[];
  equipmentSetupName?: string;
  fitnessGoals?: string[];
  primaryDiagnosis?: string;
  painScore?: number;
  activityLevel?: string;
  injuryDate?: string;
  surgeryHistory?: string;
  occupation?: string;
}) {
  const { userId, orgId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const clerkUser = await currentUser();
  if (!clerkUser) return { success: false as const, error: "User not found" };

  const profileData = {
    limitations: data.limitations ?? null,
    comorbidities: data.comorbidities ?? null,
    functionalChallenges: data.functionalChallenges ?? null,
    availableEquipment: data.availableEquipment ?? [],
    equipmentSetupName: data.equipmentSetupName?.trim().slice(0, 60) || null,
    fitnessGoals: data.fitnessGoals ?? [],
    preferredDurationMinutes: 25,
    preferredDaysPerWeek: 3,
    primaryDiagnosis: data.primaryDiagnosis ?? null,
    secondaryDiagnoses: [] as string[],
    painScore: data.painScore ?? null,
    activityLevel: data.activityLevel ?? null,
    injuryDate: data.injuryDate ? new Date(data.injuryDate) : null,
    surgeryHistory: data.surgeryHistory ?? null,
    occupation: data.occupation ?? null,
    priorInjuries: [] as string[],
  };

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      // Keep the stored org when the session has no active org — club members
      // and webhook-created clients already have the right clerkOrgId, and
      // nulling it would detach them from their org and its billing.
      ...(orgId ? { clerkOrgId: orgId } : {}),
      onboarded: true,
    },
    create: {
      clerkId: userId,
      email: clerkUser.emailAddresses[0].emailAddress,
      firstName: data.firstName,
      lastName: data.lastName,
      role: "CLIENT",
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      imageUrl: clerkUser.imageUrl,
      clerkOrgId: orgId ?? null,
      onboarded: true,
    },
  });

  await prisma.clientProfile.upsert({
    where: { userId: user.id },
    update: profileData,
    create: { userId: user.id, ...profileData },
  });

  await logUserAudit(user, () => ({
    action: AUDIT_ACTIONS.ONBOARDING_COMPLETED,
    targetType: "User",
    targetId: user.id,
    targetLabel: `${user.firstName} ${user.lastName}`,
  }));

  redirect("/dashboard");
}
