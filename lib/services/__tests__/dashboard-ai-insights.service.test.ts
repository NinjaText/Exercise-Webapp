import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateObject, mockGetClientSnapshots } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGetClientSnapshots: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => "mock-model") }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/client.service", () => ({ getClientsForTrainer: vi.fn() }));

vi.mock("@/lib/services/dashboard-insights.service", async (importActual) => {
  const actual = await importActual<typeof import("../dashboard-insights.service")>();
  return { ...actual, getClientSnapshots: mockGetClientSnapshots };
});

import { generateCoachingInsights } from "../dashboard-ai-insights.service";

const activeSnapshot = {
  clientId: "c1",
  clientName: "Jane Doe",
  sessions: [
    { status: "COMPLETED", scheduledDate: new Date(), completedAt: new Date(), startedAt: null },
  ],
  activeProgram: { name: "Knee Rehab", startDate: new Date(), durationWeeks: 12 },
  recentFeedback: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateCoachingInsights", () => {
  it("returns an empty array when the AI call fails, without throwing", async () => {
    mockGetClientSnapshots.mockResolvedValue([activeSnapshot]);
    mockGenerateObject.mockRejectedValue(new Error("model unavailable"));

    const result = await generateCoachingInsights("trainer-1");

    expect(result).toEqual([]);
  });

  it("returns an empty array when there are no active clients (no AI call made)", async () => {
    mockGetClientSnapshots.mockResolvedValue([]);

    const result = await generateCoachingInsights("trainer-1");

    expect(result).toEqual([]);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("maps and caps the AI response to at most 4 insights", async () => {
    mockGetClientSnapshots.mockResolvedValue([activeSnapshot]);
    mockGenerateObject.mockResolvedValue({
      object: {
        insights: [
          { clientName: "Jane Doe", insight: "Progress squat load", type: "suggestion" },
          { clientName: "Jane Doe", insight: "Great consistency", type: "positive" },
        ],
      },
    });

    const result = await generateCoachingInsights("trainer-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      clientName: "Jane Doe",
      insight: "Progress squat load",
      type: "suggestion",
    });
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });
});
