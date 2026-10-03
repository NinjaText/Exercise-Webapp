import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lookupFoodByBarcode,
  mapOffProduct,
  mapUsdaFood,
  type OffProduct,
  type UsdaFood,
} from "../food-barcode.service";

// Trimmed from real API responses (Oct 2026).
const OFF_DIET_COKE: OffProduct = {
  product_name: "Diet Coke Soft Drink",
  brands: "Coke",
  image_front_small_url: "https://images.openfoodfacts.org/images/products/004/900/002/8911/front_en.3.200.jpg",
  serving_size: "1 can (354.9 mL)",
  serving_quantity: 354.9,
  serving_quantity_unit: "ml",
  product_quantity: 4258.584,
  product_quantity_unit: "ml",
  nutriments: { "energy-kcal_100g": 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
};

const OFF_MARS: OffProduct = {
  product_name: "Mars",
  brands: "Mars, Mars Wrigley",
  serving_size: "100 g",
  serving_quantity: 100,
  serving_quantity_unit: "g",
  product_quantity: 51,
  product_quantity_unit: "g",
  nutriments: { "energy-kcal_100g": 450, proteins_100g: 4, carbohydrates_100g: 70, fat_100g: 16.8 },
};

const USDA_OREO: UsdaFood = {
  description: "CHOCOLATE SANDWICH COOKIES, CHOCOLATE",
  brandName: "OREO",
  brandOwner: "Nabisco Biscuit Company",
  gtinUpc: "044000032029",
  servingSize: 34,
  servingSizeUnit: "GRM",
  householdServingFullText: "3 cookies",
  foodNutrients: [
    { nutrientNumber: "203", value: 2.94 },
    { nutrientNumber: "204", value: 20.6 },
    { nutrientNumber: "205", value: 73.5 },
    { nutrientNumber: "208", value: 471 },
  ],
};

describe("mapOffProduct", () => {
  it("maps name, first brand, image, unit, serving and per-100 values", () => {
    const result = mapOffProduct("0049000028911", OFF_DIET_COKE);
    expect(result.kind).toBe("found");
    expect(result.food).toMatchObject({
      barcode: "0049000028911",
      name: "Diet Coke Soft Drink",
      brand: "Coke",
      source: "openfoodfacts",
      unit: "ml",
      per100: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      serving: { label: "1 can (354.9 mL)", amount: 354.9 },
    });
    expect(result.food?.imageUrl).toMatch(/^https:\/\//);
  });

  it("ignores multipack package sizes as a portion", () => {
    expect(mapOffProduct("0049000028911", OFF_DIET_COKE).food?.packageAmount).toBeNull();
  });

  it("treats OFF's placeholder '100 g' serving as no serving and keeps the package size", () => {
    const food = mapOffProduct("5000159407236", OFF_MARS).food;
    expect(food?.serving).toBeNull();
    expect(food?.packageAmount).toBe(51);
    expect(food?.brand).toBe("Mars");
  });

  it("falls back to the printed net quantity when OFF omits product_quantity", () => {
    const withoutParsed = { ...OFF_MARS, product_quantity: undefined, product_quantity_unit: undefined };
    expect(mapOffProduct("5000159407236", { ...withoutParsed, quantity: "51 g" }).food?.packageAmount).toBe(51);
    expect(
      mapOffProduct("5000159407236", { product_name: "Juice", quantity: "0.33 l", nutriments: { "energy-kcal_100g": 45 } })
        .food
    ).toMatchObject({ unit: "ml", packageAmount: 330 });
    expect(
      mapOffProduct("5000159407236", { ...withoutParsed, quantity: "6 x 25 g" }).food?.packageAmount
    ).toBeNull();
  });

  it("converts kJ to kcal when the label has no kcal", () => {
    const food = mapOffProduct("5000159407236", {
      product_name: "Oat drink",
      nutriments: { "energy-kj_100g": 209.2, proteins_100g: 1 },
    }).food;
    expect(food?.per100.calories).toBeCloseTo(50, 5);
    expect(food?.per100.carbsG).toBeNull();
  });

  it("returns not_found with the name when the product has no energy value", () => {
    expect(mapOffProduct("5000159407236", { product_name: "Mystery snack", nutriments: {} })).toEqual({
      kind: "not_found",
      name: "Mystery snack",
    });
  });

  it("parses numeric strings and drops non-https images", () => {
    const food = mapOffProduct("5000159407236", {
      product_name: "Crisps",
      image_url: "http://example.com/a.jpg",
      serving_size: "30 g",
      serving_quantity: "30",
      nutriments: { "energy-kcal_100g": "530" },
    }).food;
    expect(food?.per100.calories).toBe(530);
    expect(food?.serving).toEqual({ label: "30 g", amount: 30 });
    expect(food?.imageUrl).toBeNull();
  });
});

describe("mapUsdaFood", () => {
  it("maps nutrients by number, title-cases text and builds the serving label", () => {
    const result = mapUsdaFood("0044000032029", USDA_OREO);
    expect(result.food).toEqual({
      barcode: "0044000032029",
      name: "Chocolate Sandwich Cookies, Chocolate",
      brand: "Oreo",
      imageUrl: null,
      source: "usda",
      unit: "g",
      per100: { calories: 471, proteinG: 2.94, carbsG: 73.5, fatG: 20.6 },
      serving: { label: "3 cookies (34 g)", amount: 34 },
      packageAmount: null,
    });
  });

  it("returns not_found when there is no energy nutrient", () => {
    expect(mapUsdaFood("0044000032029", { ...USDA_OREO, foodNutrients: [] }).kind).toBe("not_found");
  });
});

describe("lookupFoodByBarcode", () => {
  const fetchMock = vi.fn();

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FDC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the Open Food Facts product without calling USDA", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 1, product: OFF_MARS }));
    const result = await lookupFoodByBarcode("5000159407236");
    expect(result).toMatchObject({ status: "found", food: { source: "openfoodfacts", name: "Mars" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("world.openfoodfacts.org/api/v2/product/5000159407236");
  });

  it("falls back to USDA when Open Food Facts does not know the product", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 0 }, 404))
      .mockResolvedValueOnce(json({ foods: [{ ...USDA_OREO, gtinUpc: "999" }, USDA_OREO] }));
    const result = await lookupFoodByBarcode("0044000032029");
    expect(result).toMatchObject({ status: "found", food: { source: "usda", brand: "Oreo" } });
    expect(String(fetchMock.mock.calls[1][0])).toContain("api.nal.usda.gov");
  });

  it("ignores USDA search hits whose GTIN does not match", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 0 }, 404))
      .mockResolvedValueOnce(json({ foods: [{ ...USDA_OREO, gtinUpc: "012345678905" }] }));
    expect(await lookupFoodByBarcode("0044000032029")).toEqual({ status: "not_found", name: null });
  });

  it("falls back to USDA when the OFF product has no nutrition, keeping its name if USDA misses", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 1, product: { product_name: "Local bread", nutriments: {} } }))
      .mockResolvedValueOnce(json({ foods: [] }));
    expect(await lookupFoodByBarcode("5000159407236")).toEqual({ status: "not_found", name: "Local bread" });
  });

  it("skips USDA when no API key is configured", async () => {
    vi.stubEnv("FDC_API_KEY", "");
    fetchMock.mockResolvedValueOnce(json({ status: 0 }, 404));
    expect(await lookupFoodByBarcode("5000159407236")).toEqual({ status: "not_found", name: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws instead of reporting not_found when a source errored", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(json({ foods: [] }));
    await expect(lookupFoodByBarcode("5000159407236")).rejects.toThrow(/temporarily unavailable/);
  });

  it("still returns a USDA hit when Open Food Facts errored", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ foods: [USDA_OREO] }));
    expect(await lookupFoodByBarcode("0044000032029")).toMatchObject({ status: "found" });
  });
});
