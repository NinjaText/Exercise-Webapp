"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { logUserAudit } from "@/lib/services/audit-log.service";
import {
  EquipmentProfileError,
  createEquipmentProfile,
  deleteEquipmentProfile,
  listEquipmentProfiles,
  saveClientEquipment,
  updateEquipmentProfile,
  type EquipmentProfileInput,
  type EquipmentProfileView,
} from "@/lib/services/equipment-profile.service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function failure(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof EquipmentProfileError) return { ok: false, error: err.message };
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

/** The signed-in user's own saved profiles (trainer or client). */
export async function listMyEquipmentProfilesAction(): Promise<Result<EquipmentProfileView[]>> {
  const user = await getCurrentUser();
  try {
    return { ok: true, data: await listEquipmentProfiles(user.id) };
  } catch (err) {
    return failure(err, "Failed to load equipment profiles");
  }
}

/** Creates a profile, or updates one of the user's own when `id` is given. */
export async function saveEquipmentProfileAction(
  input: EquipmentProfileInput & { id?: string }
): Promise<Result<EquipmentProfileView>> {
  const user = await getCurrentUser();
  try {
    const { id, ...data } = input;
    const profile = id
      ? await updateEquipmentProfile(user.id, id, data)
      : await createEquipmentProfile(user.id, data);
    await logUserAudit(user, () => ({
      action: id ? AUDIT_ACTIONS.EQUIPMENT_PROFILE_UPDATED : AUDIT_ACTIONS.EQUIPMENT_PROFILE_CREATED,
      targetType: "EquipmentProfile",
      targetId: profile.id,
      targetLabel: profile.name,
    }));
    revalidatePath("/settings/equipment");
    return { ok: true, data: profile };
  } catch (err) {
    return failure(err, "Failed to save equipment profile");
  }
}

export async function deleteEquipmentProfileAction(id: string): Promise<Result<null>> {
  const user = await getCurrentUser();
  try {
    await deleteEquipmentProfile(user.id, id);
    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.EQUIPMENT_PROFILE_DELETED,
      targetType: "EquipmentProfile",
      targetId: id,
    }));
    revalidatePath("/settings/equipment");
    return { ok: true, data: null };
  } catch (err) {
    return failure(err, "Failed to delete equipment profile");
  }
}

export interface MyEquipment {
  items: string[];
  setupName: string | null;
}

/** A client's own active equipment. */
export async function getMyEquipmentAction(): Promise<Result<MyEquipment>> {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") return { ok: false, error: "Only clients have their own equipment" };
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: user.id },
      select: { availableEquipment: true, equipmentSetupName: true },
    });
    return {
      ok: true,
      data: { items: profile?.availableEquipment ?? [], setupName: profile?.equipmentSetupName ?? null },
    };
  } catch (err) {
    return failure(err, "Failed to load your equipment");
  }
}

/** Lets a client change the equipment the AI plans their programs around. */
export async function saveMyEquipmentAction(items: string[], setupName: string | null): Promise<Result<MyEquipment>> {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") return { ok: false, error: "Only clients have their own equipment" };
  try {
    const saved = await saveClientEquipment(user.id, items, setupName);
    await logUserAudit(user, () => ({
      action: AUDIT_ACTIONS.CLIENT_EQUIPMENT_UPDATED,
      targetType: "ClientProfile",
      targetId: user.id,
      targetLabel: saved.equipmentSetupName ?? "Custom",
    }));
    revalidatePath("/settings/equipment");
    return { ok: true, data: { items: saved.availableEquipment, setupName: saved.equipmentSetupName } };
  } catch (err) {
    return failure(err, "Failed to save your equipment");
  }
}
