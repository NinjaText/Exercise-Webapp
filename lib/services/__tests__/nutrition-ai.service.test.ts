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

import { estimateMealMacrosBatch } from "../nutrition-ai.service";

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
