"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as collectionService from "@/lib/services/collection.service";

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

export async function getCollectionsAction() {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const collections = await collectionService.getCollectionsWithCounts(user.id);
    return { success: true as const, data: collections };
  } catch (error) {
    console.error("Failed to load collections:", error);
    return { success: false as const, error: "Failed to load collections" };
  }
}

export async function createCollectionAction(name: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const trimmed = name.trim();
  if (!trimmed) return { success: false as const, error: "Name is required" };

  try {
    const collection = await collectionService.createCollection(user.id, trimmed);
    revalidatePath("/programs");
    return { success: true as const, data: collection };
  } catch (error) {
    console.error("Failed to create collection:", error);
    return { success: false as const, error: "A collection with that name already exists" };
  }
}

export async function renameCollectionAction(collectionId: string, name: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
  if (!collection || collection.trainerId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  const trimmed = name.trim();
  if (!trimmed) return { success: false as const, error: "Name is required" };

  try {
    const updated = await collectionService.renameCollection(collectionId, trimmed);
    revalidatePath("/programs");
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to rename collection:", error);
    return { success: false as const, error: "A collection with that name already exists" };
  }
}

export async function deleteCollectionAction(collectionId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
  if (!collection || collection.trainerId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await collectionService.deleteCollection(collectionId, user.id);
    revalidatePath("/programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete collection:", error);
    return { success: false as const, error: "Failed to delete collection" };
  }
}
