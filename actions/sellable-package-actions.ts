"use server";

import { activeUserOnly } from "@/lib/auth/active-user";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import {
  createSellablePackage,
  getSellablePackageByProgramTemplateId,
  updateSellablePackage,
} from "@/lib/services/sellable-package.service";

async function getTrainerUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser || dbUser.role !== "TRAINER") return null;
  return dbUser;
}

async function getOwnedTemplate(programId: string, trainerId: string) {
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program || program.trainerId !== trainerId || !program.isTemplate || program.clientId) {
    return null;
  }
  return program;
}

export async function getSellablePackageForProgramAction(programId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await getOwnedTemplate(programId, user.id);
  if (!program) return { success: false as const, error: "Program not found" };

  const pkg = await getSellablePackageByProgramTemplateId(programId, user.id);
  return { success: true as const, data: pkg };
}

export async function getTrainerTemplatesForBundleAction(excludeProgramId: string) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const templates = await programService.getTemplates(user.id);
  const filtered = templates.filter((t) => t.id !== excludeProgramId);
  return { success: true as const, data: filtered };
}

export async function createSellablePackageAction(input: {
  programId: string;
  priceInCents: number;
  bundle?: { programTemplateId: string; priceInCents: number };
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await getOwnedTemplate(input.programId, user.id);
  if (!program) return { success: false as const, error: "Program not found" };

  if (input.priceInCents <= 0) {
    return { success: false as const, error: "Price must be greater than zero" };
  }

  try {
    let upsellPackageId: string | undefined;
    if (input.bundle) {
      if (input.bundle.priceInCents <= 0) {
        return { success: false as const, error: "Bundle price must be greater than zero" };
      }
      const bundleTemplate = await getOwnedTemplate(input.bundle.programTemplateId, user.id);
      if (!bundleTemplate) {
        return { success: false as const, error: "Bundle template not found" };
      }
      const bundlePkg = await createSellablePackage({
        trainerId: user.id,
        name: `${bundleTemplate.name} Bundle`,
        priceInCents: input.bundle.priceInCents,
        programTemplateId: input.bundle.programTemplateId,
        kind: "bundle",
      });
      upsellPackageId = bundlePkg.id;
    }

    const pkg = await createSellablePackage({
      trainerId: user.id,
      name: program.name,
      priceInCents: input.priceInCents,
      programTemplateId: input.programId,
      kind: "program",
      upsellPackageId,
    });

    revalidatePath(`/programs/${input.programId}`);
    return { success: true as const, data: pkg };
  } catch (error) {
    console.error("Failed to create sellable package:", error);
    return { success: false as const, error: "Failed to create sellable package" };
  }
}

export async function updateSellablePackageAction(input: {
  packageId: string;
  programId: string;
  priceInCents?: number;
  isActive?: boolean;
  bundle?: { programTemplateId: string; priceInCents: number } | null;
}) {
  const user = await getTrainerUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  if (input.priceInCents !== undefined && input.priceInCents <= 0) {
    return { success: false as const, error: "Price must be greater than zero" };
  }
  if (input.bundle) {
    if (input.bundle.priceInCents <= 0) {
      return { success: false as const, error: "Bundle price must be greater than zero" };
    }
    const bundleTemplate = await getOwnedTemplate(input.bundle.programTemplateId, user.id);
    if (!bundleTemplate) {
      return { success: false as const, error: "Bundle template not found" };
    }
  }

  try {
    const pkg = await updateSellablePackage(input.packageId, user.id, {
      priceInCents: input.priceInCents,
      isActive: input.isActive,
      bundle: input.bundle,
    });
    revalidatePath(`/programs/${input.programId}`);
    return { success: true as const, data: pkg };
  } catch (error) {
    console.error("Failed to update sellable package:", error);
    return { success: false as const, error: "Failed to update sellable package" };
  }
}
