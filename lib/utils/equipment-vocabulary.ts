/**
 * Canonical equipment names. Exercise.equipmentRequired is free text, so the
 * library holds "Resistance Band", "resistance band (optional)", "cable or
 * band", "light dumbbell (1-2 lb)"… This maps every spelling onto one label,
 * so the program form's picker and the generation-time equipment filter agree
 * on what each option means.
 */

const NO_EQUIPMENT = new Set(['', 'none', 'bodyweight', 'body weight', 'no equipment'])

/** Values that aren't equipment a client owns ("hill or resistance", typos). */
const NOT_EQUIPMENT = new Set(['ee', 'hill', 'resistance', 'assistance'])

/** Lowercased spelling (parenthetical notes stripped) → canonical label. */
const ALIASES: Record<string, string> = {
  dumbbell: 'Dumbbells',
  dumbbells: 'Dumbbells',
  'light dumbbell': 'Dumbbells',
  'light dumbbells': 'Dumbbells',
  db: 'Dumbbells',
  band: 'Resistance Band',
  bands: 'Resistance Band',
  'resistance band': 'Resistance Band',
  'resistance bands': 'Resistance Band',
  'mini band': 'Resistance Band',
  'loop band': 'Resistance Band',
  mat: 'Yoga Mat',
  'yoga mat': 'Yoga Mat',
  'exercise mat': 'Yoga Mat',
  step: 'Step/Stair',
  stair: 'Step/Stair',
  stairs: 'Step/Stair',
  'low stair': 'Step/Stair',
  staircase: 'Step/Stair',
  'staircase with railing': 'Step/Stair',
  towel: 'Towel',
  'towel roll': 'Towel',
  'foam roller': 'Foam Roller',
  'stability ball': 'Stability Ball',
  'swiss ball': 'Stability Ball',
  'bosu ball': 'BOSU Ball',
  bosu: 'BOSU Ball',
  'medicine ball': 'Medicine Ball',
  'med ball': 'Medicine Ball',
  'pull-up bar': 'Pull-Up Bar',
  'pullup bar': 'Pull-Up Bar',
  'balance board': 'Balance Board',
  'wobble board': 'Balance Board',
  'rocker board': 'Balance Board',
  'balance pad': 'Balance Pad',
  'thick foam': 'Balance Pad',
  cone: 'Cone',
  'small obstacle': 'Cone',
  stick: 'Stick/Cane',
  cane: 'Stick/Cane',
  plate: 'Wedge/Plate',
  wedge: 'Wedge/Plate',
  'anchor point for feet': 'Anchor Point',
  'anchor point': 'Anchor Point',
  'ankle weight': 'Ankle Weights',
  'ankle weights': 'Ankle Weights',
  trx: 'TRX',
  suspension: 'TRX',
  // Gym spellings for the equipment catalogue (equipment-catalog.ts).
  'ez bar': 'EZ Bar',
  'ez curl bar': 'EZ Bar',
  kettlebells: 'Kettlebell',
  barbells: 'Barbell',
  'flat bench': 'Bench',
  'adjustable bench': 'Bench',
  'incline bench': 'Bench',
  'weight bench': 'Bench',
  'plyo box': 'Box',
  'plyometric box': 'Box',
  'squat rack': 'Squat Rack',
  'power rack': 'Squat Rack',
  'cable machine': 'Cable',
  'cable station': 'Cable',
  'lat pulldown machine': 'Lat Pulldown',
  'leg press machine': 'Leg Press',
  'leg extension machine': 'Leg Extension',
  'leg curl machine': 'Leg Curl',
  rower: 'Rowing Machine',
  'rowing ergometer': 'Rowing Machine',
  bike: 'Stationary Bike',
  'exercise bike': 'Stationary Bike',
  'air bike': 'Assault Bike',
  'skipping rope': 'Jump Rope',
  'weight plate': 'Weight Plates',
  'weight plates': 'Weight Plates',
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function canonicalAlternative(value: string): string | null {
  const key = value.trim().replace(/\s+/g, ' ')
  if (NO_EQUIPMENT.has(key) || NOT_EQUIPMENT.has(key)) return null
  return ALIASES[key] ?? titleCase(key)
}

/**
 * Canonical labels a raw equipment value stands for. "cable or band" and
 * "Step/Stair" name alternatives (either will do), so they return several
 * labels; "None", "(optional)" items and junk return none.
 */
export function canonicalEquipment(raw: string): string[] {
  if (/\boptional\b/i.test(raw)) return []
  const base = raw.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (NO_EQUIPMENT.has(base) || NOT_EQUIPMENT.has(base)) return []
  if (ALIASES[base]) return [ALIASES[base]]
  const labels = base
    .split(/\s+or\s+|\s*\/\s*/)
    .map(canonicalAlternative)
    .filter((label): label is string => label !== null)
  return [...new Set(labels)]
}

/** Sorted, de-duplicated canonical labels across a set of raw values. */
export function canonicalEquipmentList(rawValues: string[]): string[] {
  return [...new Set(rawValues.flatMap(canonicalEquipment))].sort((a, b) => a.localeCompare(b))
}
