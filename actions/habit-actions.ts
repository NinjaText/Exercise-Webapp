"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import * as habitService from "@/lib/services/habit.service";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Creates a new habit. Both trainers (assigning to a client) and clients
 * (creating their own) may call this action.
 *
 * Trainers must supply `clientId`; clients use their own id.
 */
export async function createHabitAction(data: {
  clientId?: string;
  name: string;
  icon?: string;
  targetValue?: number;
  unit?: string;
  frequency?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();

  if (!data.name?.trim()) {
    return { success: false, error: "Habit name is required" };
  }

  // Resolve which client this habit belongs to
  let targetClientId: string;

  if (user.role === "TRAINER") {
    if (!data.clientId) {
      return { success: false, error: "Client is required when creating a habit as a trainer" };
    }
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(data.clientId)) {
      return { success: false, error: "Unauthorized" };
    }
    targetClientId = data.clientId;
  } else {
    // CLIENT — always their own id
    targetClientId = user.id;
  }

  try {
    const habit = await habitService.createHabit({
      clientId: targetClientId,
      trainerId: user.role === "TRAINER" ? user.id : undefined,
      name: data.name,
      icon: data.icon,
      targetValue: data.targetValue,
      unit: data.unit,
      frequency: data.frequency ?? "DAILY",
    });

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: { id: habit.id } };
  } catch (error) {
    console.error("createHabitAction failed:", error);
    return { success: false, error: "Failed to create habit" };
  }
}

/**
 * Logs (or updates) today's entry for a habit. Only the owning client or
 * a trainer linked to that client should call this — the page-level auth
 * guards enforce ownership; here we do a basic role check.
 */
export async function logHabitAction(
  habitId: string,
  completed: boolean,
  value?: number,
  notes?: string
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();

  if (!habitId) {
    return { success: false, error: "Habit ID is required" };
  }

  const habit = await prisma.habitDefinition.findUnique({
    where: { id: habitId },
    select: { clientId: true },
  });
  if (!habit) {
    return { success: false, error: "Habit not found" };
  }
  if (user.role === "CLIENT" && habit.clientId !== user.id) {
    return { success: false, error: "Unauthorized" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(habit.clientId)) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    const log = await habitService.logHabit(
      habitId,
      new Date(),
      completed,
      value,
      notes
    );

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: { id: log.id } };
  } catch (error) {
    console.error("logHabitAction failed:", error);
    return { success: false, error: "Failed to log habit" };
  }
}

/**
 * Soft-deletes a habit (sets isActive = false). Only the creating trainer
 * or the client who owns it may delete it.
 */
export async function deleteHabitAction(
  habitId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();

  if (!habitId) {
    return { success: false, error: "Habit ID is required" };
  }

  const habit = await prisma.habitDefinition.findUnique({
    where: { id: habitId },
    select: { clientId: true },
  });
  if (!habit) {
    return { success: false, error: "Habit not found" };
  }
  if (user.role === "CLIENT" && habit.clientId !== user.id) {
    return { success: false, error: "Unauthorized" };
  }
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    if (!clientIds.includes(habit.clientId)) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    await habitService.deleteHabit(habitId);

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteHabitAction failed:", error);
    return { success: false, error: "Failed to delete habit" };
  }
}
