import { describe, it, expect } from "vitest";
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_PRESETS,
  equipmentCount,
  expandAvailableEquipment,
  isBodyweightOnly,
  matchEquipmentSetup,
} from "../equipment-catalog";
import { canonicalEquipment } from "../equipment-vocabulary";

// Labels the exercise library used when the catalogue was written. They must
// stay in the catalogue verbatim or those exercises become unselectable.
const LIBRARY_LABELS = [
  "Ab Wheel", "Anchor Point", "Balance Board", "Balance Pad", "Barbell", "Bench", "BOSU Ball", "Box", "Cable",
  "Chair", "Cone", "Doorway", "Dumbbells", "Foam Roller", "Kettlebell", "Medicine Ball", "Pool", "Pull-Up Bar",
  "Resistance Band", "Slider", "Smith Machine", "Stability Ball", "Step/Stair", "Stick/Cane", "Table", "Towel",
  "Wall", "Wedge/Plate", "Yoga Mat",
];

describe("EQUIPMENT_CATALOG", () => {
  it.each(EQUIPMENT_CATALOG.map((l) => [l]))("%s is its own canonical label", (label) => {
    expect(canonicalEquipment(label)).toEqual([label]);
  });

  it("has no duplicates across categories", () => {
    expect(new Set(EQUIPMENT_CATALOG).size).toBe(EQUIPMENT_CATALOG.length);
  });

  it("keeps every label the exercise library uses", () => {
    for (const label of LIBRARY_LABELS) expect(EQUIPMENT_CATALOG).toContain(label);
  });

  it("every category has items", () => {
    for (const c of EQUIPMENT_CATEGORIES) expect(c.items.length).toBeGreaterThan(0);
  });
});

describe("EQUIPMENT_PRESETS", () => {
  it("only use catalogue items (or the bodyweight value)", () => {
    for (const p of EQUIPMENT_PRESETS) {
      for (const item of p.items) {
        if (item !== "None") expect(EQUIPMENT_CATALOG).toContain(item);
      }
      expect(new Set(p.items).size).toBe(p.items.length);
    }
  });

  it("get smaller from Full Gym down to Bodyweight", () => {
    const counts = EQUIPMENT_PRESETS.map((p) => equipmentCount(p.items));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts.at(-1)).toBe(0);
  });
});

describe("matchEquipmentSetup", () => {
  const home = EQUIPMENT_PRESETS.find((p) => p.id === "home-gym")!;
  it("names a preset regardless of order or case", () => {
    expect(matchEquipmentSetup([...home.items].reverse().map((i) => i.toLowerCase()))).toBe("Home Gym");
  });
  it("names a saved profile", () => {
    expect(matchEquipmentSetup(["Barbell", "Bench"], [{ name: "My Garage", items: ["Bench", "Barbell"] }])).toBe("My Garage");
  });
  it("prefers a preset over a profile with the same items", () => {
    expect(matchEquipmentSetup(home.items, [{ name: "Copy", items: home.items }])).toBe("Home Gym");
  });
  it("returns null for a hand-picked or empty selection", () => {
    expect(matchEquipmentSetup(["Barbell"])).toBeNull();
    expect(matchEquipmentSetup([])).toBeNull();
  });
  it("recognises bodyweight only", () => {
    expect(matchEquipmentSetup(["none"])).toBe("Bodyweight only");
  });
});

describe("helpers", () => {
  it("any machine implies the generic Machine label", () => {
    expect(expandAvailableEquipment(["Leg Press"]).has("Machine")).toBe(true);
    expect(expandAvailableEquipment(["Dumbbells"]).has("Machine")).toBe(false);
  });
  it("isBodyweightOnly accepts both spellings", () => {
    expect(isBodyweightOnly(["None"])).toBe(true);
    expect(isBodyweightOnly(["none"])).toBe(true);
    expect(isBodyweightOnly(["Dumbbells"])).toBe(false);
  });
});
