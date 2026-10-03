import { describe, it, expect } from "vitest";
import {
  normalizeBarcode,
  portionAmount,
  portionQuantityLabel,
  macrosForPortion,
  scannedFoodDescription,
  type ScannedFood,
} from "../food-barcode";

describe("normalizeBarcode", () => {
  it("keeps a valid EAN-13", () => {
    expect(normalizeBarcode("5000159407236")).toBe("5000159407236");
  });

  it("strips spaces and dashes from typed codes", () => {
    expect(normalizeBarcode(" 5 000159-407236 ")).toBe("5000159407236");
  });

  it("pads a valid UPC-A to EAN-13", () => {
    expect(normalizeBarcode("049000028911")).toBe("0049000028911");
  });

  it("drops the leading zero of a GTIN-14", () => {
    expect(normalizeBarcode("00049000028911")).toBe("0049000028911");
  });

  it("keeps a valid EAN-8", () => {
    expect(normalizeBarcode("96385074")).toBe("96385074");
  });

  it("expands a UPC-E code to EAN-13 when the scanner reports upc_e", () => {
    // UPC-E 04252614 ↔ UPC-A 042100005264
    expect(normalizeBarcode("04252614", "upc_e")).toBe("0042100005264");
  });

  it("expands a typed 8-digit code as UPC-E when it is not a valid EAN-8", () => {
    expect(normalizeBarcode("04252614")).toBe("0042100005264");
  });

  it("rejects a bad check digit", () => {
    expect(normalizeBarcode("5000159407237")).toBeNull();
  });

  it("rejects wrong lengths and non-numeric input", () => {
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode("abc")).toBeNull();
    expect(normalizeBarcode("")).toBeNull();
  });
});

const food: ScannedFood = {
  barcode: "5000159407236",
  name: "Mars",
  brand: "Mars",
  imageUrl: null,
  source: "openfoodfacts",
  unit: "g",
  per100: { calories: 450, proteinG: 4, carbsG: 70, fatG: 16.8 },
  serving: { label: "1 bar (51 g)", amount: 51 },
  packageAmount: 51,
};

describe("portionAmount", () => {
  it("multiplies servings by the serving size", () => {
    expect(portionAmount(food, "serving", 2)).toBe(102);
  });

  it("uses the typed amount directly", () => {
    expect(portionAmount(food, "amount", 30)).toBe(30);
  });

  it("multiplies packages by the package size", () => {
    expect(portionAmount(food, "package", 0.5)).toBe(25.5);
  });

  it("returns null when the chosen basis is missing or the quantity is not positive", () => {
    expect(portionAmount({ ...food, serving: null }, "serving", 1)).toBeNull();
    expect(portionAmount({ ...food, packageAmount: null }, "package", 1)).toBeNull();
    expect(portionAmount(food, "amount", 0)).toBeNull();
    expect(portionAmount(food, "amount", Number.NaN)).toBeNull();
  });
});

describe("macrosForPortion", () => {
  it("scales per-100 values, rounding calories to whole and macros to one decimal", () => {
    expect(macrosForPortion(food.per100, 51)).toEqual({
      calories: 230,
      proteinG: 2,
      carbsG: 35.7,
      fatG: 8.6,
    });
  });

  it("keeps missing macros as null", () => {
    expect(macrosForPortion({ calories: 42, proteinG: null, carbsG: 10.6, fatG: null }, 330)).toEqual({
      calories: 139,
      proteinG: null,
      carbsG: 35,
      fatG: null,
    });
  });
});

describe("portionQuantityLabel", () => {
  it("describes servings with the resulting amount", () => {
    expect(portionQuantityLabel(food, "serving", 1)).toBe("1 serving · 1 bar (51 g)");
    expect(portionQuantityLabel(food, "serving", 1.5)).toBe("1.5 servings (76.5 g)");
  });

  it("describes a raw amount with its unit", () => {
    expect(portionQuantityLabel({ ...food, unit: "ml" }, "amount", 250)).toBe("250 ml");
  });

  it("describes packages with the resulting amount", () => {
    expect(portionQuantityLabel(food, "package", 1)).toBe("1 package (51 g)");
    expect(portionQuantityLabel(food, "package", 2)).toBe("2 packages (102 g)");
  });
});

describe("scannedFoodDescription", () => {
  it("appends the brand when it is not already in the name", () => {
    expect(scannedFoodDescription({ name: "Greek Yogurt", brand: "Fage" })).toBe("Greek Yogurt (Fage)");
  });

  it("does not repeat a brand that is already in the name", () => {
    expect(scannedFoodDescription({ name: "Mars", brand: "Mars" })).toBe("Mars");
    expect(scannedFoodDescription({ name: "Oreo Cookies", brand: "OREO" })).toBe("Oreo Cookies");
  });

  it("uses the name alone without a brand", () => {
    expect(scannedFoodDescription({ name: "Milk", brand: null })).toBe("Milk");
  });
});
