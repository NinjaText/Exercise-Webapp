import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateObject } = vi.hoisted(() => ({ mockGenerateObject: vi.fn() }));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => "mock-model") }));
vi.mock("@/lib/prisma", () => ({
  prisma: { nutritionAiSummary: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/services/nutrition.service", () => ({
  getDailySummary: vi.fn(),
  getNutritionHistory: vi.fn(),
  averageAdherence: vi.fn(),
}));

import {
  analyzeMealPhoto,
  estimateMealMacrosBatch,
  reconcileCalories,
  reestimateMealPhotoItem,
  removeDuplicatedComponents,
  type MealPhotoFoodDraft,
} from "../nutrition-ai.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateMealMacrosBatch", () => {
  it("returns an empty array without calling the model for an empty item list", async () => {
    const result = await estimateMealMacrosBatch([]);
    expect(result).toEqual([]);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns one estimate per input item, in order", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        items: [
          { calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 },
          { calories: 300, proteinG: 25, carbsG: 0, fatG: 20 },
        ],
      },
    });

    const result = await estimateMealMacrosBatch([
      { name: "Coffee", quantity: "1 cup" },
      { name: "Roasted chicken", quantity: "6 oz" },
    ]);

    expect(result).toEqual([
      { calories: 5, proteinG: 0.3, carbsG: 1, fatG: 0 },
      { calories: 300, proteinG: 25, carbsG: 0, fatG: 20 },
    ]);
  });

  it("throws if the model returns a different number of estimates than items submitted", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { items: [{ calories: 100, proteinG: 2, carbsG: 20, fatG: 1 }] },
    });

    await expect(
      estimateMealMacrosBatch([{ name: "Coffee" }, { name: "Bread" }])
    ).rejects.toThrow();
  });
});

function food(name: string, calories: number, components: string[] = []): MealPhotoFoodDraft {
  return { name, quantity: "1 serving", calories, proteinG: 10, carbsG: 10, fatG: 10, components };
}

describe("analyzeMealPhoto", () => {
  it("instructs the model to log combined dishes once, with ingredients as components", async () => {
    mockGenerateObject.mockResolvedValue({ object: { foods: [food("Apple", 95)] } });

    await analyzeMealPhoto("https://example.com/meal.jpg");

    const call = mockGenerateObject.mock.calls[0][0] as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    const prompt = call.messages[0].content.find((c) => c.type === "text")?.text ?? "";
    expect(prompt).toMatch(/combined dish/i);
    expect(prompt).toMatch(/NEVER also list a dish's ingredients as separate items/);
  });

  it("drops ingredient rows the model duplicated alongside their dish", async () => {
    const sandwich = food("Turkey sandwich", 450, ["whole wheat bread", "turkey", "cheddar cheese", "lettuce"]);
    mockGenerateObject.mockResolvedValue({
      object: {
        foods: [sandwich, food("Whole wheat bread", 160), food("Turkey", 90), food("Cheddar cheese", 110), food("French fries", 320)],
      },
    });

    const result = await analyzeMealPhoto("https://example.com/meal.jpg");

    expect(result.map((f) => f.name)).toEqual(["Turkey sandwich", "French fries"]);
    expect(result[0].components).toEqual(sandwich.components);
  });
});

describe("removeDuplicatedComponents", () => {
  it("leaves results without any combined dish untouched", () => {
    const foods = [food("Apple", 95), food("Greek yogurt", 150)];
    expect(removeDuplicatedComponents(foods)).toEqual(foods);
  });

  it("matches case- and punctuation-insensitively, and when the component is more specific", () => {
    const foods = [
      food("Burger", 650, ["brioche bun", "beef patty", "sliced cheddar"]),
      food("BEEF-PATTY", 250),
      food("Cheddar", 110),
    ];
    expect(removeDuplicatedComponents(foods).map((f) => f.name)).toEqual(["Burger"]);
  });

  it("keeps genuine sides that only share a word with a component", () => {
    const foods = [food("Burger", 650, ["bun", "beef patty", "cheese"]), food("Cheese sauce", 120)];
    expect(removeDuplicatedComponents(foods).map((f) => f.name)).toEqual(["Burger", "Cheese sauce"]);
  });

  it("never removes a dish that has its own components", () => {
    const foods = [food("Chicken salad", 400, ["chicken", "lettuce"]), food("Chicken", 300, ["chicken breast", "olive oil"])];
    expect(removeDuplicatedComponents(foods)).toEqual(foods);
  });
});

function promptOf(callIndex = 0): string {
  const call = mockGenerateObject.mock.calls[callIndex][0] as {
    messages: { content: { type: string; text?: string }[] }[];
  };
  return call.messages[0].content.find((c) => c.type === "text")?.text ?? "";
}

describe("reconcileCalories", () => {
  it("recomputes calories from macros when they disagree beyond tolerance", () => {
    // The reported pizza: 120g P / 280g C / 120g F is 2680 kcal, not 2400.
    const result = reconcileCalories({ calories: 2400, proteinG: 120, carbsG: 280, fatG: 120 });
    expect(result.calories).toBe(2680);
  });

  it("keeps the model's calories when they are within 10% of the macros", () => {
    const estimate = { calories: 500, proteinG: 30, carbsG: 50, fatG: 22 }; // macros = 518 kcal
    expect(reconcileCalories(estimate)).toEqual(estimate);
  });

  it("leaves items without macros alone", () => {
    const estimate = { calories: 5, proteinG: 0, carbsG: 0, fatG: 0 };
    expect(reconcileCalories(estimate)).toEqual(estimate);
  });
});

describe("analyzeMealPhoto calibration", () => {
  it("returns self-consistent calories and asks for the assumed size", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { foods: [food("Whole pizza", 2400, ["crust", "cheese"])].map((f) => ({ ...f, proteinG: 120, carbsG: 280, fatG: 120 })) },
    });

    const [pizza] = await analyzeMealPhoto("https://example.com/pizza.jpg");

    expect(pizza.calories).toBe(2680);
    expect(promptOf()).toMatch(/assume the most common size/i);
    expect(promptOf()).toMatch(/state the assumed size and slice count/i);
  });

  it("passes the user's re-analyze note to the model", async () => {
    mockGenerateObject.mockResolvedValue({ object: { foods: [food("Pizza slice", 280)] } });

    await analyzeMealPhoto("https://example.com/pizza.jpg", "I only ate 2 slices");

    expect(promptOf()).toContain('"I only ate 2 slices"');
  });

  it("sends no note section when none is given", async () => {
    mockGenerateObject.mockResolvedValue({ object: { foods: [food("Apple", 95)] } });

    await analyzeMealPhoto("https://example.com/apple.jpg");

    expect(promptOf()).not.toMatch(/added a note/);
  });
});

describe("reestimateMealPhotoItem", () => {
  it("sends the photo with the corrected item and amount", async () => {
    mockGenerateObject.mockResolvedValue({ object: { calories: 285, proteinG: 12, carbsG: 34, fatG: 11 } });

    const result = await reestimateMealPhotoItem("https://example.com/pizza.jpg", {
      name: "Pepperoni pizza",
      quantity: "1 slice",
      components: ["crust", "cheese", "pepperoni"],
    });

    expect(result).toEqual({ calories: 285, proteinG: 12, carbsG: 34, fatG: 11 });
    const call = mockGenerateObject.mock.calls[0][0] as { messages: { content: { type: string; image?: string }[] }[] };
    expect(call.messages[0].content.find((c) => c.type === "image")?.image).toBe("https://example.com/pizza.jpg");
    expect(promptOf()).toContain("Food: Pepperoni pizza");
    expect(promptOf()).toContain("Amount actually eaten: 1 slice");
    expect(promptOf()).toContain("Ingredients: crust, cheese, pepperoni");
  });

  it("reconciles calories against macros", async () => {
    mockGenerateObject.mockResolvedValue({ object: { calories: 100, proteinG: 12, carbsG: 34, fatG: 11 } });

    const result = await reestimateMealPhotoItem("https://example.com/pizza.jpg", { name: "Pizza", quantity: "1 slice" });

    expect(result.calories).toBe(283);
  });
});
