"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";

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

  try {
    const organizationName = data.organizationName.trim();
    const client = await clerkClient();
    const org = await client.organizations.createOrganization({
      name: organizationName,
      createdBy: userId,
    });

    // The DB Organization row is the canonical org profile.
    await prisma.organization.create({
      data: { clerkOrgId: org.id, name: organizationName },
    });

    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        role: "TRAINER",
        phone: data.phone ?? null,
        clerkOrgId: org.id,
        onboarded: true,
      },
      create: {
        clerkId: userId,
        email: clerkUser.emailAddresses[0].emailAddress,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "TRAINER",
        phone: data.phone ?? null,
        imageUrl: clerkUser.imageUrl,
        clerkOrgId: org.id,
        onboarded: true,
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
      clerkOrgId: orgId ?? null,
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

  redirect("/dashboard");
}
