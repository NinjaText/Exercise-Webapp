/**
 * Packaged-food barcode helpers shared by the scanner UI and the lookup service.
 * Pure functions only — safe to import on the client.
 */

export type FoodUnit = "g" | "ml";

export interface FoodMacrosPer100 {
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/** A packaged food resolved from its barcode, with label values per 100 g (or 100 ml). */
export interface ScannedFood {
  /** Canonical code (EAN-13, or EAN-8 / GTIN-14 when that is what was printed). */
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  source: "openfoodfacts" | "usda";
  unit: FoodUnit;
  per100: FoodMacrosPer100;
  /** The label's serving, when it states one. `amount` is in `unit`. */
  serving: { label: string; amount: number } | null;
  /** Net contents of the package in `unit`, when known. */
  packageAmount: number | null;
}

export type BarcodeLookupResult =
  | { status: "found"; food: ScannedFood }
  | { status: "not_found"; name: string | null };

/** How the eaten amount is expressed: label servings, grams/ml, or whole packages. */
export type PortionMode = "serving" | "amount" | "package";

/** Barcode formats a scanner can report; only `upc_e` changes how a code is read. */
export type ScannedBarcodeFormat = "ean_13" | "ean_8" | "upc_a" | "upc_e" | (string & {});

function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    // GS1: weights alternate 3,1,3,… starting from the digit next to the check digit.
    const weight = (body.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Expands an 8-digit UPC-E code to its 12-digit UPC-A form, or null if it is not UPC-E. */
function expandUpcE(code: string): string | null {
  const numberSystem = code[0];
  if (numberSystem !== "0" && numberSystem !== "1") return null;
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7);
  const check = code[7];
  let body: string;
  if (d6 === "0" || d6 === "1" || d6 === "2") body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${numberSystem}${body}${check}`;
}

/**
 * Validates a scanned or typed product barcode and returns the code to look up,
 * or null when it is not a valid UPC/EAN. UPC-A and UPC-E are returned as EAN-13.
 */
export function normalizeBarcode(raw: string, format?: ScannedBarcodeFormat): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;

  if (digits.length === 8) {
    if (format !== "upc_e" && hasValidCheckDigit(digits)) return digits;
    const upcA = expandUpcE(digits);
    return upcA && hasValidCheckDigit(upcA) ? `0${upcA}` : null;
  }
  if (digits.length === 12) return hasValidCheckDigit(digits) ? `0${digits}` : null;
  if (digits.length === 13) return hasValidCheckDigit(digits) ? digits : null;
  if (digits.length === 14) {
    if (!hasValidCheckDigit(digits)) return null;
    return digits.startsWith("0") ? digits.slice(1) : digits;
  }
  return null;
}

/** The eaten amount in the food's unit, or null when it cannot be worked out. */
export function portionAmount(food: ScannedFood, mode: PortionMode, quantity: number): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (mode === "amount") return quantity;
  const basis = mode === "serving" ? food.serving?.amount : food.packageAmount;
  return basis ? round(quantity * basis, 1) : null;
}

/** Label values scaled to the eaten amount. */
export function macrosForPortion(per100: FoodMacrosPer100, amount: number): FoodMacrosPer100 {
  const scale = (value: number | null, decimals: number) =>
    value === null ? null : round((value * amount) / 100, decimals);
  return {
    calories: scale(per100.calories, 0) ?? 0,
    proteinG: scale(per100.proteinG, 1),
    carbsG: scale(per100.carbsG, 1),
    fatG: scale(per100.fatG, 1),
  };
}

/** Human-readable serving text stored on the log, e.g. "1.5 servings (45 g)". */
export function portionQuantityLabel(food: ScannedFood, mode: PortionMode, quantity: number): string {
  const amount = portionAmount(food, mode, quantity);
  const amountText = amount === null ? "" : ` (${formatNumber(amount)} ${food.unit})`;
  const qty = formatNumber(quantity);
  if (mode === "amount") return `${qty} ${food.unit}`;
  if (mode === "package") return `${qty} package${quantity === 1 ? "" : "s"}${amountText}`;
  if (quantity === 1 && food.serving) return `1 serving · ${food.serving.label}`;
  return `${qty} servings${amountText}`;
}

/** The log description: product name plus brand, unless the name already says it. */
export function scannedFoodDescription(food: Pick<ScannedFood, "name" | "brand">): string {
  if (!food.brand || food.name.toLowerCase().includes(food.brand.toLowerCase())) return food.name;
  return `${food.name} (${food.brand})`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatNumber(value: number): string {
  return String(round(value, 1));
}
