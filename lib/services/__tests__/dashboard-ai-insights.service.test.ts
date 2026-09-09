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
  activeProgram: { id: "prog_1", name: "Knee Rehab", startDate: new Date(), durationWeeks: 12 },
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

  it("maps the AI response and joins each insight with its server-resolved program id", async () => {
    mockGetClientSnapshots.mockResolvedValue([activeSnapshot]);
    mockGenerateObject.mockResolvedValue({
      object: {
        insights: [
          {
            clientId: "c1",
            clientName: "Jane Doe",
            kind: "progression_opportunity",
            what: "Jane completed every squat set at target RPE.",
            why: "She has capacity for more load.",
            action: "Increase squat load by 5% next week.",
            type: "suggestion",
          },
          {
            clientId: "c1",
            clientName: "Jane Doe",
            kind: "consistency_streak",
            what: "Jane hit six sessions in a row.",
            why: "Consistency predicts outcome gains.",
            action: "Send her a note acknowledging the streak.",
            type: "positive",
          },
        ],
      },
    });

    const result = await generateCoachingInsights("trainer-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      clientId: "c1",
      kind: "progression_opportunity",
      programId: "prog_1",
    });
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });

  it("drops insights whose clientId does not match a known client", async () => {
    mockGetClientSnapshots.mockResolvedValue([activeSnapshot]);
    mockGenerateObject.mockResolvedValue({
      object: {
        insights: [
          {
            clientId: "hallucinated_id",
            clientName: "Nobody",
            kind: "inactive",
            what: "x",
            why: "y",
            action: "z",
            type: "warning",
          },
          {
            clientId: "c1",
            clientName: "Jane Doe",
            kind: "inactive",
            what: "x",
            why: "y",
            action: "z",
            type: "warning",
          },
        ],
      },
    });

    const result = await generateCoachingInsights("trainer-1");

    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe("c1");
  });
});
