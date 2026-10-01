"use server";

import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50, "First name is too long"),
  lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name is too long"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long")
    .regex(/^[0-9+()\-.\s]*$/, "Use digits, spaces and + ( ) - only"),
});

export type ProfileInput = z.input<typeof profileSchema>;

export type ProfileResult =
  | { success: true }
  | { success: false; error: string; field?: keyof ProfileInput };

/**
 * Saves the signed-in user's own name and phone. The name lives in both
 * Clerk (sign-in screens, emails Clerk sends) and our User row (everything
 * the app renders), and the Clerk webhook doesn't sync names back, so both
 * are written here: Clerk first, so a Clerk failure leaves nothing half-saved.
 */
export async function updateMyProfileAction(input: ProfileInput): Promise<ProfileResult> {
  const user = await getCurrentUser();

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, error: issue.message, field: issue.path[0] as keyof ProfileInput };
  }
  const { firstName, lastName, phone } = parsed.data;

  try {
    const clerk = await clerkClient();
    await clerk.users.updateUser(user.clerkId, { firstName, lastName });
  } catch (error) {
    console.error("[profile] clerk update failed for", user.clerkId, error);
    return { success: false, error: "We couldn't save your profile. Please try again." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { firstName, lastName, phone: phone || null },
  });

  // The sidebar and top bar show the name on every page.
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Copies the profile photo and primary email from Clerk onto our User row.
 * Photo uploads and email changes happen client-side through Clerk; the
 * `user.updated` webhook does the same sync eventually, but calling this
 * right after makes the app reflect the change immediately.
 */
export async function syncMyClerkProfileAction(): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();

  let clerkUser;
  try {
    const clerk = await clerkClient();
    clerkUser = await clerk.users.getUser(user.clerkId);
  } catch (error) {
    console.error("[profile] clerk fetch failed for", user.clerkId, error);
    return { success: false, error: "We couldn't refresh your profile." };
  }

  const primaryEmail = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress;
  const data: { imageUrl: string | null; email?: string } = {
    imageUrl: clerkUser.hasImage ? clerkUser.imageUrl : null,
  };

  if (primaryEmail && primaryEmail !== user.email) {
    // email is unique on User; never steal another account's address.
    const taken = await prisma.user.findFirst({
      where: { email: primaryEmail, NOT: { id: user.id } },
      select: { id: true },
    });
    if (taken) {
      await prisma.user.update({ where: { id: user.id }, data: { imageUrl: data.imageUrl } });
      return { success: false, error: "That email is already used by another account here." };
    }
    data.email = primaryEmail;
  }

  await prisma.user.update({ where: { id: user.id }, data });
  revalidatePath("/", "layout");
  return { success: true };
}
