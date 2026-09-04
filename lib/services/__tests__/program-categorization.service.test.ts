import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

import { categorizeGeneratedProgram } from "../program-categorization.service";
import type { GeneratedProgram } from "../ai.service";

function plan(overrides: Partial<GeneratedProgram> = {}): GeneratedProgram {
  return {
    name: "4-Week Strength Builder",
    description: "A progressive strength program.",
    workouts: [
      {
        name: "Day 1",
        dayIndex: 0,
        weekIndex: 0,
        blocks: [
          {
            type: "CIRCUIT",
            orderIndex: 0,
            exercises: [
              { exerciseId: "ex1", exerciseName: "Barbell Squat", orderIndex: 0, sets: 3, reps: "10" },
              { exerciseId: "ex2", exerciseName: "Shoulder Press", orderIndex: 1, sets: 3, reps: "10" },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function chatResponse(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("categorizeGeneratedProgram", () => {
  it("returns the AI-provided categorization when the model responds with a valid shape", async () => {
    mockCreate.mockResolvedValue(
      chatResponse({
        bodyAreas: ["Shoulder", "Knee"],
        goals: ["Build Strength"],
        activities: ["Basketball"],
        level: "INTERMEDIATE",
        tags: ["home-workout", "progressive-overload"],
      })
    );

    const result = await categorizeGeneratedProgram(plan(), {
      programGoals: ["Build Strength"],
      difficultyLevel: "INTERMEDIATE",
    });

    expect(result).toEqual({
      bodyAreas: ["Shoulder", "Knee"],
      goals: ["Build Strength"],
      activities: ["Basketball"],
      level: "INTERMEDIATE",
      tags: ["home-workout", "progressive-overload"],
    });
  });

  it("falls back to the trainer's known goals/level when the AI omits them", async () => {
    mockCreate.mockResolvedValue(
      chatResponse({ bodyAreas: [], goals: [], activities: [], level: null, tags: [] })
    );

    const result = await categorizeGeneratedProgram(plan(), {
      programGoals: ["Reduce Pain"],
      difficultyLevel: "BEGINNER",
      circuits: [{ focusType: "LOWER_BODY" }, { focusType: "WARMUP" }],
    });

    expect(result.goals).toEqual(["Reduce Pain"]);
    expect(result.level).toBe("BEGINNER");
    expect(result.bodyAreas).toEqual(["Lower Body"]);
  });

  it("falls back to a deterministic result when the AI response is invalid JSON", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });

    const result = await categorizeGeneratedProgram(plan(), {
      programGoals: ["Build Strength"],
      difficultyLevel: "ADVANCED",
      circuits: [{ focusType: "CORE" }],
    });

    expect(result).toEqual({
      bodyAreas: ["Core"],
      goals: ["Build Strength"],
      activities: [],
      tags: [],
      level: "ADVANCED",
    });
  });

  it("falls back to a deterministic result when the AI response fails schema validation", async () => {
    mockCreate.mockResolvedValue(chatResponse({ bodyAreas: "not-an-array" }));

    const result = await categorizeGeneratedProgram(plan(), {
      programGoals: ["Improve Mobility"],
      difficultyLevel: "BEGINNER",
    });

    expect(result).toEqual({
      bodyAreas: [],
      goals: ["Improve Mobility"],
      activities: [],
      tags: [],
      level: "BEGINNER",
    });
  });

  it("falls back to a deterministic result when the API call throws", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const result = await categorizeGeneratedProgram(plan(), {
      programGoals: ["Athletic Performance"],
      difficultyLevel: "INTERMEDIATE",
      circuits: [{ focusType: "FULL_BODY" }],
    });

    expect(result).toEqual({
      bodyAreas: ["Full Body"],
      goals: ["Athletic Performance"],
      activities: [],
      tags: [],
      level: "INTERMEDIATE",
    });
  });

  it("ignores an unrecognized difficulty level from context", async () => {
    mockCreate.mockRejectedValue(new Error("network error"));

    const result = await categorizeGeneratedProgram(plan(), {
      programGoals: [],
      difficultyLevel: "EXPERT",
    });

    expect(result.level).toBeNull();
  });
});
