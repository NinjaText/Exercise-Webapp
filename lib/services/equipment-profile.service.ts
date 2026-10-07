import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BODYWEIGHT_ONLY, isBodyweightOnly } from "@/lib/utils/equipment-catalog";

/** Per-user cap, so a runaway client can't fill the table. */
export const MAX_EQUIPMENT_PROFILES = 30;
const MAX_ITEMS = 200;

export class EquipmentProfileError extends Error {}

export interface EquipmentProfileView {
  id: string;
  name: string;
  items: string[];
}

const itemsSchema = z.array(z.string().trim().min(1).max(80)).max(MAX_ITEMS, "Too many items");

export const equipmentProfileInputSchema = z.object({
  name: z.string().trim().min(1, "Give the profile a name").max(60, "Keep the name under 60 characters"),
  items: itemsSchema,
});
export type EquipmentProfileInput = z.input<typeof equipmentProfileInputSchema>;

/**
 * De-duplicates case-insensitively (first spelling wins). "Bodyweight only" is
 * exclusive: mixed with real equipment it is dropped, alone it is stored as
 * the canonical "None" the rest of the app already understands.
 */
export function normalizeEquipmentItems(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  const real = out.filter((i) => !isBodyweightOnly([i]));
  if (real.length > 0) return real;
  return isBodyweightOnly(out) ? [BODYWEIGHT_ONLY] : [];
}

function parseInput(input: EquipmentProfileInput) {
  const parsed = equipmentProfileInputSchema.safeParse(input);
  if (!parsed.success) throw new EquipmentProfileError(parsed.error.issues[0].message);
  const items = normalizeEquipmentItems(parsed.data.items);
  if (items.length === 0) throw new EquipmentProfileError("Pick at least one item (or Bodyweight only)");
  return { name: parsed.data.name, items };
}

const toView = (p: { id: string; name: string; items: string[] }): EquipmentProfileView => ({
  id: p.id,
  name: p.name,
  items: p.items,
});

export async function listEquipmentProfiles(ownerId: string): Promise<EquipmentProfileView[]> {
  const rows = await prisma.equipmentProfile.findMany({
    where: { ownerId },
    select: { id: true, name: true, items: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toView);
}

async function assertNameFree(ownerId: string, name: string, exceptId?: string) {
  const mine = await prisma.equipmentProfile.findMany({ where: { ownerId }, select: { id: true, name: true } });
  if (mine.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase())) {
    throw new EquipmentProfileError(`You already have a profile called "${name}"`);
  }
  return mine.length;
}

export async function createEquipmentProfile(ownerId: string, input: EquipmentProfileInput) {
  const data = parseInput(input);
  const count = await assertNameFree(ownerId, data.name);
  if (count >= MAX_EQUIPMENT_PROFILES) {
    throw new EquipmentProfileError(`You can save up to ${MAX_EQUIPMENT_PROFILES} profiles`);
  }
  return toView(await prisma.equipmentProfile.create({ data: { ownerId, ...data } }));
}

/** Only the owner can change a profile; anyone else gets "not found". */
export async function updateEquipmentProfile(ownerId: string, id: string, input: EquipmentProfileInput) {
  const data = parseInput(input);
  const existing = await prisma.equipmentProfile.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) throw new EquipmentProfileError("Profile not found");
  await assertNameFree(ownerId, data.name, id);
  return toView(await prisma.equipmentProfile.update({ where: { id }, data }));
}

export async function deleteEquipmentProfile(ownerId: string, id: string) {
  const res = await prisma.equipmentProfile.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new EquipmentProfileError("Profile not found");
}

/**
 * A client's active equipment: what the AI reads (`availableEquipment`) plus
 * the name of the setup it came from, for display.
 */
export async function saveClientEquipment(userId: string, items: readonly string[], setupName: string | null) {
  const parsed = itemsSchema.safeParse(items);
  if (!parsed.success) throw new EquipmentProfileError(parsed.error.issues[0].message);
  const data = {
    availableEquipment: normalizeEquipmentItems(parsed.data),
    equipmentSetupName: setupName?.trim().slice(0, 60) || null,
  };
  await prisma.clientProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  return data;
}
