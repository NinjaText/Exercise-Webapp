import type { BarcodeLookupResult, FoodUnit, ScannedFood } from "@/lib/nutrition/food-barcode";

/**
 * Resolves a packaged-food barcode to label nutrition: Open Food Facts first
 * (free, global), then USDA FoodData Central branded foods when FDC_API_KEY is set.
 */

const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "image_front_small_url",
  "image_url",
  "serving_size",
  "serving_quantity",
  "serving_quantity_unit",
  "product_quantity",
  "product_quantity_unit",
  "quantity",
  // Only the nutrients we use, rather than the whole (large) nutriments object.
  "nutriments.energy-kcal_100g",
  "nutriments.energy-kj_100g",
  "nutriments.energy_100g",
  "nutriments.proteins_100g",
  "nutriments.carbohydrates_100g",
  "nutriments.fat_100g",
].join(",");

const USER_AGENT = "InmotusRX/1.0 (nutrition barcode lookup)";
const TIMEOUT_MS = 5000;
const KJ_PER_KCAL = 4.184;
/** Package sizes above this are multipacks or bulk tubs — "1 package" is not a useful portion. */
const MAX_PACKAGE_PORTION = 1000;

type Source = "found" | "not_found" | "error";
type SourceResult = { kind: Source; food?: ScannedFood; name?: string | null };

export async function lookupFoodByBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const off = await fromOpenFoodFacts(barcode);
  if (off.food) return { status: "found", food: off.food };

  const usda = await fromUsda(barcode);
  if (usda.food) return { status: "found", food: usda.food };

  // Don't report "not found" (which is cached) when a source simply failed to answer.
  if (off.kind === "error" || usda.kind === "error") {
    throw new Error("Barcode lookup is temporarily unavailable");
  }
  return { status: "not_found", name: off.name ?? usda.name ?? null };
}

// ─── Open Food Facts ─────────────────────────────────────────────────────────

async function fromOpenFoodFacts(barcode: string): Promise<SourceResult> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }
    );
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) throw new Error(`Open Food Facts responded ${res.status}`);
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    if (body.status !== 1 || !body.product) return { kind: "not_found" };
    return mapOffProduct(barcode, body.product);
  } catch (err) {
    console.error("[food-barcode] Open Food Facts lookup failed:", err);
    return { kind: "error" };
  }
}

export interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  image_front_small_url?: string;
  image_url?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  /** Printed net contents, e.g. "51 g" — OFF sometimes omits the parsed product_quantity. */
  quantity?: string;
  nutriments?: Record<string, unknown>;
}

export function mapOffProduct(barcode: string, p: OffProduct): SourceResult {
  const name = cleanText(p.product_name) ?? cleanText(p.product_name_en) ?? cleanText(p.generic_name);
  const n = p.nutriments ?? {};
  const kcal = num(n["energy-kcal_100g"]);
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  const calories = kcal ?? (kj !== null ? kj / KJ_PER_KCAL : null);
  if (calories === null) return { kind: "not_found", name };

  const printed = parseNetQuantity(p.quantity);
  const declaredUnit = p.product_quantity_unit ?? p.serving_quantity_unit;
  const unit = declaredUnit ? toUnit(declaredUnit) : (printed?.unit ?? "g");
  const servingAmount = num(p.serving_quantity);
  const servingLabel = cleanText(p.serving_size);
  // OFF fills "100 g" when no serving is printed — that is the per-100 basis, not a serving.
  const isPlaceholderServing = servingAmount === 100 && (!servingLabel || /^100\s*(g|ml)$/i.test(servingLabel));
  const serving =
    servingAmount && servingAmount > 0 && !isPlaceholderServing
      ? { label: servingLabel ?? `${servingAmount} ${unit}`, amount: servingAmount }
      : null;
  const packageAmount = num(p.product_quantity) ?? (printed && printed.unit === unit ? printed.amount : null);

  return {
    kind: "found",
    food: {
      barcode,
      name: name ?? "Scanned product",
      brand: cleanText(p.brands?.split(",")[0]),
      imageUrl: httpsUrl(p.image_front_small_url) ?? httpsUrl(p.image_url),
      source: "openfoodfacts",
      unit,
      per100: {
        calories,
        proteinG: num(n["proteins_100g"]),
        carbsG: num(n["carbohydrates_100g"]),
        fatG: num(n["fat_100g"]),
      },
      serving,
      packageAmount: packageAmount && packageAmount > 0 && packageAmount <= MAX_PACKAGE_PORTION ? packageAmount : null,
    },
  };
}

// ─── USDA FoodData Central ───────────────────────────────────────────────────

async function fromUsda(barcode: string): Promise<SourceResult> {
  const apiKey = process.env.FDC_API_KEY;
  if (!apiKey) return { kind: "not_found" };
  try {
    const params = new URLSearchParams({ api_key: apiKey, query: barcode, dataType: "Branded", pageSize: "10" });
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`USDA responded ${res.status}`);
    const body = (await res.json()) as { foods?: UsdaFood[] };
    const match = body.foods?.find((f) => f.gtinUpc && sameGtin(f.gtinUpc, barcode));
    return match ? mapUsdaFood(barcode, match) : { kind: "not_found" };
  } catch (err) {
    console.error("[food-barcode] USDA lookup failed:", err);
    return { kind: "error" };
  }
}

export interface UsdaFood {
  description?: string;
  brandName?: string;
  brandOwner?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: { nutrientNumber?: string; value?: number }[];
}

export function mapUsdaFood(barcode: string, f: UsdaFood): SourceResult {
  const name = f.description ? titleCase(f.description) : null;
  // Branded search results report nutrients per 100 g / 100 ml.
  const nutrient = (number: string) => num(f.foodNutrients?.find((n) => n.nutrientNumber === number)?.value);
  const kcal = nutrient("208");
  const kj = nutrient("268");
  const calories = kcal ?? (kj !== null ? kj / KJ_PER_KCAL : null);
  if (calories === null) return { kind: "not_found", name };

  const unit = toUnit(f.servingSizeUnit);
  const servingAmount = num(f.servingSize);
  const household = cleanText(f.householdServingFullText);
  const serving =
    servingAmount && servingAmount > 0
      ? {
          label: household ? `${household} (${servingAmount} ${unit})` : `${servingAmount} ${unit}`,
          amount: servingAmount,
        }
      : null;
  const brand = cleanText(f.brandName) ?? cleanText(f.brandOwner);

  return {
    kind: "found",
    food: {
      barcode,
      name: name ?? "Scanned product",
      brand: brand ? titleCase(brand) : null,
      imageUrl: null,
      source: "usda",
      unit,
      per100: { calories, proteinG: nutrient("203"), carbsG: nutrient("205"), fatG: nutrient("204") },
      serving,
      packageAmount: null,
    },
  };
}

function sameGtin(a: string, b: string): boolean {
  const strip = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
  return strip(a) === strip(b);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function httpsUrl(value: string | undefined): string | null {
  return value?.startsWith("https://") ? value : null;
}

/** Parses a single net quantity like "51 g", "1.5 kg" or "330 ml"; multipacks ("6 x 330 ml") return null. */
function parseNetQuantity(value: string | undefined): { amount: number; unit: FoodUnit } | null {
  const match = value?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l)\b/i);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  const factor: Record<string, [number, FoodUnit]> = { g: [1, "g"], kg: [1000, "g"], ml: [1, "ml"], cl: [10, "ml"], l: [1000, "ml"] };
  const [scale, unit] = factor[match[2].toLowerCase()];
  return amount > 0 ? { amount: amount * scale, unit } : null;
}

function toUnit(value: string | undefined): FoodUnit {
  return value && /^(ml|mlt|l|cl|fl ?oz)$/i.test(value.trim()) ? "ml" : "g";
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}
