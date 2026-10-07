/**
 * The equipment a client can own or train with, grouped the way a gym is laid
 * out, plus the built-in setups ("Home Gym", "Commercial Gym"…) that fill a
 * whole selection in one click.
 *
 * Every label here must survive `canonicalEquipment` unchanged (see
 * equipment-vocabulary.ts and its test): the AI's equipment filter compares
 * canonical labels on both sides, so a catalogue label that canonicalises to
 * something else would never match an exercise. Labels the exercise library
 * already uses ("Cable", "Bench", "Box"…) are kept verbatim for that reason.
 *
 * Lives in lib/utils (no Prisma) so client components can import it.
 */

export interface EquipmentCategory {
  id: string;
  label: string;
  items: readonly string[];
}

export const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = [
  {
    id: "free-weights",
    label: "Free weights",
    items: ["Dumbbells", "Barbell", "EZ Bar", "Kettlebell", "Weight Plates", "Medicine Ball", "Ankle Weights", "Sandbag"],
  },
  {
    id: "benches-racks",
    label: "Benches & racks",
    items: ["Bench", "Squat Rack", "Smith Machine", "Pull-Up Bar", "Dip Station", "Box", "Landmine"],
  },
  {
    id: "machines",
    label: "Machines",
    items: [
      "Cable",
      "Lat Pulldown",
      "Seated Row Machine",
      "Chest Press Machine",
      "Shoulder Press Machine",
      "Pec Deck",
      "Leg Press",
      "Hack Squat",
      "Leg Extension",
      "Leg Curl",
      "Hip Abduction Machine",
      "Calf Raise Machine",
      "Assisted Pull-Up Machine",
    ],
  },
  {
    id: "cardio",
    label: "Cardio",
    items: ["Treadmill", "Stationary Bike", "Assault Bike", "Rowing Machine", "Elliptical", "Stair Climber", "Ski Erg", "Jump Rope"],
  },
  {
    id: "small-equipment",
    label: "Small equipment",
    items: [
      "Resistance Band",
      "TRX",
      "Yoga Mat",
      "Foam Roller",
      "Stability Ball",
      "BOSU Ball",
      "Ab Wheel",
      "Slider",
      "Cone",
      "Agility Ladder",
      "Battle Ropes",
    ],
  },
  {
    id: "home-rehab",
    label: "Home & rehab",
    items: [
      "Chair",
      "Wall",
      "Towel",
      "Step/Stair",
      "Table",
      "Doorway",
      "Anchor Point",
      "Balance Board",
      "Balance Pad",
      "Stick/Cane",
      "Wedge/Plate",
      "Pool",
    ],
  },
];

/** Every catalogue item, in category order. */
export const EQUIPMENT_CATALOG: readonly string[] = EQUIPMENT_CATEGORIES.flatMap((c) => c.items);

/**
 * Stored value meaning "bodyweight only" on a client profile (the onboarding
 * list has always used "None"). The program form uses its own lowercase
 * sentinel; `isBodyweightOnly` accepts both.
 */
export const BODYWEIGHT_ONLY = "None";

export function isBodyweightOnly(items: readonly string[]): boolean {
  return items.some((item) => item.trim().toLowerCase() === "none");
}

/**
 * Exercise names like "Seated Leg Press Machine" imply a generic "Machine"
 * requirement (see inferEquipmentFromName). Any selected machine satisfies it.
 */
const MACHINE_ITEMS = new Set([
  ...(EQUIPMENT_CATEGORIES.find((c) => c.id === "machines")?.items ?? []),
  "Smith Machine",
]);
export const GENERIC_MACHINE = "Machine";

/** Adds the generic labels a selection implies (currently: any machine → "Machine"). */
export function expandAvailableEquipment(canonicalLabels: Iterable<string>): Set<string> {
  const available = new Set(canonicalLabels);
  for (const label of available) {
    if (MACHINE_ITEMS.has(label)) {
      available.add(GENERIC_MACHINE);
      break;
    }
  }
  return available;
}

export type EquipmentPresetId = "full-gym" | "commercial-gym" | "home-gym" | "minimal" | "bodyweight";

export interface EquipmentPreset {
  id: EquipmentPresetId;
  name: string;
  description: string;
  items: readonly string[];
}

const category = (id: string) => EQUIPMENT_CATEGORIES.find((c) => c.id === id)?.items ?? [];

export const EQUIPMENT_PRESETS: readonly EquipmentPreset[] = [
  {
    id: "full-gym",
    name: "Full Gym",
    description: "Everything in the catalogue",
    items: EQUIPMENT_CATALOG,
  },
  {
    id: "commercial-gym",
    name: "Commercial Gym",
    description: "Free weights, racks, machines and cardio",
    items: [
      ...category("free-weights"),
      ...category("benches-racks"),
      ...category("machines"),
      ...category("cardio"),
      "Resistance Band",
      "TRX",
      "Yoga Mat",
      "Foam Roller",
      "Stability Ball",
      "BOSU Ball",
      "Ab Wheel",
      "Battle Ropes",
      "Wall",
      "Towel",
      "Step/Stair",
    ],
  },
  {
    id: "home-gym",
    name: "Home Gym",
    description: "Dumbbells, kettlebell, bench, bands and the basics",
    items: [
      "Dumbbells",
      "Kettlebell",
      "Bench",
      "Pull-Up Bar",
      "Resistance Band",
      "Yoga Mat",
      "Stability Ball",
      "Foam Roller",
      "Jump Rope",
      "Chair",
      "Wall",
      "Towel",
      "Step/Stair",
      "Doorway",
      "Table",
    ],
  },
  {
    id: "minimal",
    name: "Minimal / Travel",
    description: "A band, a mat and what's in any room",
    items: ["Resistance Band", "Yoga Mat", "Towel", "Chair", "Wall"],
  },
  {
    id: "bodyweight",
    name: "Bodyweight only",
    description: "No equipment at all",
    items: [BODYWEIGHT_ONLY],
  },
];

/** How many real pieces of equipment a selection holds ("None" counts as zero). */
export function equipmentCount(items: readonly string[]): number {
  return items.filter((item) => item.trim().toLowerCase() !== "none").length;
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  const norm = (items: readonly string[]) =>
    [...new Set(items.map((i) => i.trim().toLowerCase()))].sort().join("|");
  return norm(a) === norm(b);
}

/**
 * The name of the preset or saved profile a selection exactly matches, or
 * null when it matches none (a hand-picked list). Presets win a tie.
 */
export function matchEquipmentSetup(
  items: readonly string[],
  profiles: readonly { name: string; items: readonly string[] }[] = []
): string | null {
  if (items.length === 0) return null;
  const match =
    EQUIPMENT_PRESETS.find((p) => sameSelection(p.items, items)) ??
    profiles.find((p) => sameSelection(p.items, items));
  return match?.name ?? null;
}
