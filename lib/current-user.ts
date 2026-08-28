import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

export async function getCurrentUser(): Promise<User> {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    // New Clerk user: orgId present = came via org invitation = client path
    if (orgId) redirect("/onboarding/client");
    redirect("/onboarding");
  }

  if (!user.isActive) redirect("/account-deactivated");

  // Auto-sync clerkOrgId from the live Clerk session into the DB.
  // This handles accounts created before Clerk Organizations were configured —
  // the DB field stays null until the user logs in again, at which point it's fixed.
  if (orgId && !user.clerkOrgId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { clerkOrgId: orgId },
    });
  }

  if (!user.onboarded) {
    if (user.role === "CLIENT") redirect("/onboarding/client");
    redirect("/onboarding");
  }

  return user;
}

export async function getCurrentUserOrNull(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId } });
}

export async function requireRole(role: "TRAINER" | "CLIENT"): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect("/dashboard");
  return user;
}

export async function requireSuperAdmin(): Promise<User> {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) redirect("/sign-in");

  // Clerk publicMetadata path (used once Clerk dashboard is configured)
  const meta = sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
  const hasClerkFlag = meta?.superAdmin === true;

  // Env-var fallback — add SUPER_ADMIN_EMAILS=you@example.com to .env
  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const hasEmailFlag = allowedEmails.includes(user.email.toLowerCase());

  if (!hasClerkFlag && !hasEmailFlag) redirect("/dashboard");
  return user;
}

export async function isSuperAdmin(): Promise<boolean> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  const meta = sessionClaims?.publicMetadata as { superAdmin?: boolean } | undefined;
  if (meta?.superAdmin === true) return true;

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return false;

  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(user.email.toLowerCase());
}
