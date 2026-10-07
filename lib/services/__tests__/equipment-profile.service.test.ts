import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    equipmentProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    clientProfile: { upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  MAX_EQUIPMENT_PROFILES,
  createEquipmentProfile,
  deleteEquipmentProfile,
  normalizeEquipmentItems,
  saveClientEquipment,
  updateEquipmentProfile,
} from "../equipment-profile.service";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.equipmentProfile.findMany).mockResolvedValue([]);
  vi.mocked(prisma.equipmentProfile.create).mockImplementation(
    (async (args: { data: Record<string, unknown> }) => ({ id: "p1", ...args.data })) as never
  );
  vi.mocked(prisma.equipmentProfile.update).mockImplementation(
    (async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data })) as never
  );
});

describe("normalizeEquipmentItems", () => {
  it("trims and de-duplicates case-insensitively, keeping the first spelling", () => {
    expect(normalizeEquipmentItems([" Dumbbells ", "dumbbells", "Bench", ""])).toEqual(["Dumbbells", "Bench"]);
  });
  it("drops bodyweight-only when real equipment is present", () => {
    expect(normalizeEquipmentItems(["None", "Bench"])).toEqual(["Bench"]);
  });
  it("stores bodyweight-only as the canonical None", () => {
    expect(normalizeEquipmentItems(["none"])).toEqual(["None"]);
  });
});

describe("createEquipmentProfile", () => {
  it("saves a trimmed name and normalized items for the owner", async () => {
    const p = await createEquipmentProfile("u1", { name: "  My Garage ", items: ["Bench", "bench", "Barbell"] });
    expect(prisma.equipmentProfile.create).toHaveBeenCalledWith({
      data: { ownerId: "u1", name: "My Garage", items: ["Bench", "Barbell"] },
    });
    expect(p).toEqual({ id: "p1", name: "My Garage", items: ["Bench", "Barbell"] });
  });

  it("refuses a duplicate name (any case)", async () => {
    vi.mocked(prisma.equipmentProfile.findMany).mockResolvedValue([{ id: "x", name: "my garage" }] as never);
    await expect(createEquipmentProfile("u1", { name: "My Garage", items: ["Bench"] })).rejects.toThrow(/already have/);
  });

  it("refuses an empty name or no items", async () => {
    await expect(createEquipmentProfile("u1", { name: " ", items: ["Bench"] })).rejects.toThrow(/name/);
    await expect(createEquipmentProfile("u1", { name: "Empty", items: [] })).rejects.toThrow(/at least one/);
  });

  it("caps how many profiles a user can save", async () => {
    vi.mocked(prisma.equipmentProfile.findMany).mockResolvedValue(
      Array.from({ length: MAX_EQUIPMENT_PROFILES }, (_, i) => ({ id: `p${i}`, name: `P${i}` })) as never
    );
    await expect(createEquipmentProfile("u1", { name: "One more", items: ["Bench"] })).rejects.toThrow(/up to/);
  });
});

describe("updateEquipmentProfile / deleteEquipmentProfile", () => {
  it("only updates the owner's profile", async () => {
    vi.mocked(prisma.equipmentProfile.findFirst).mockResolvedValue(null);
    await expect(updateEquipmentProfile("u2", "p1", { name: "X", items: ["Bench"] })).rejects.toThrow(/not found/);
    expect(prisma.equipmentProfile.findFirst).toHaveBeenCalledWith({ where: { id: "p1", ownerId: "u2" }, select: { id: true } });
    expect(prisma.equipmentProfile.update).not.toHaveBeenCalled();
  });

  it("lets a profile keep its own name when renaming", async () => {
    vi.mocked(prisma.equipmentProfile.findFirst).mockResolvedValue({ id: "p1" } as never);
    vi.mocked(prisma.equipmentProfile.findMany).mockResolvedValue([{ id: "p1", name: "My Garage" }] as never);
    await expect(updateEquipmentProfile("u1", "p1", { name: "My Garage", items: ["Bench"] })).resolves.toMatchObject({
      name: "My Garage",
    });
  });

  it("deletes scoped to the owner and reports a miss", async () => {
    vi.mocked(prisma.equipmentProfile.deleteMany).mockResolvedValue({ count: 0 });
    await expect(deleteEquipmentProfile("u2", "p1")).rejects.toThrow(/not found/);
    expect(prisma.equipmentProfile.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", ownerId: "u2" } });
  });
});

describe("saveClientEquipment", () => {
  it("writes the items the AI reads plus the setup name", async () => {
    await saveClientEquipment("c1", ["Dumbbells", "dumbbells", "Bench"], "  Home Gym ");
    expect(prisma.clientProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "c1" },
      update: { availableEquipment: ["Dumbbells", "Bench"], equipmentSetupName: "Home Gym" },
      create: { userId: "c1", availableEquipment: ["Dumbbells", "Bench"], equipmentSetupName: "Home Gym" },
    });
  });
  it("stores null for a hand-picked list", async () => {
    await saveClientEquipment("c1", ["Bench"], null);
    expect(prisma.clientProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { availableEquipment: ["Bench"], equipmentSetupName: null } })
    );
  });
});
