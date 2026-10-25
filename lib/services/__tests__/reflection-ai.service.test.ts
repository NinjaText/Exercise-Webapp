import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateObject } = vi.hoisted(() => ({ mockGenerateObject: vi.fn() }));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => "mock-model") }));

import { generateProgramPlanReflections, generateReflectionOptions } from "../reflection-ai.service";

const style = { theme: "Mindset", tone: "Calm", kind: "QUESTION" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateReflectionOptions", () => {
  it("returns at most three cleaned options and enforces the requested kind", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        options: [
          { kind: "QUOTE", text: "  One  ", guidance: "" },
          { kind: "QUESTION", text: "Two", guidance: "Think about it" },
          { kind: "QUESTION", text: "   ", guidance: null },
          { kind: "QUESTION", text: "Three", guidance: null },
          { kind: "QUESTION", text: "Four", guidance: null },
        ],
      },
    });

    const options = await generateReflectionOptions(style);

    expect(options).toEqual([
      { kind: "QUESTION", text: "One", guidance: null },
      { kind: "QUESTION", text: "Two", guidance: "Think about it" },
      { kind: "QUESTION", text: "Three", guidance: null },
    ]);
  });

  it("puts the trainer's settings in the prompt", async () => {
    mockGenerateObject.mockResolvedValue({ object: { options: [] } });

    await generateReflectionOptions({ ...style, audience: "Runners", context: "Marathon prep" });

    const { prompt } = mockGenerateObject.mock.calls[0][0];
    expect(prompt).toContain("Theme: Mindset");
    expect(prompt).toContain("Audience: Runners");
    expect(prompt).toContain("Marathon prep");
  });
});

describe("generateProgramPlanReflections", () => {
  it("chunks requests into calls of at most 30 days", async () => {
    mockGenerateObject.mockImplementation(async ({ prompt }: { prompt: string }) => {
      const match = /days: ([\d, ]+)\./.exec(prompt)!;
      const days = match[1].split(", ").map(Number);
      return { object: { days: days.map((dayNumber) => ({ dayNumber, kind: "PROMPT", text: `Day ${dayNumber}`, guidance: null })) } };
    });

    const result = await generateProgramPlanReflections({
      style: { ...style, kind: "MIXED" },
      dayNumbers: Array.from({ length: 45 }, (_, i) => i + 1),
      totalDays: 45,
      programName: "Base",
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(45);
    expect(result[0]).toEqual({ dayNumber: 1, kind: "PROMPT", text: "Day 1", guidance: null });
  });

  it("caps a request at 120 days", async () => {
    mockGenerateObject.mockResolvedValue({ object: { days: [] } });

    await generateProgramPlanReflections({
      style,
      dayNumbers: Array.from({ length: 200 }, (_, i) => i + 1),
      totalDays: 200,
      programName: "Long",
    });

    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
  });

  it("drops days that weren't requested and duplicate days", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        days: [
          { dayNumber: 2, kind: "QUESTION", text: "A", guidance: null },
          { dayNumber: 2, kind: "QUESTION", text: "B", guidance: null },
          { dayNumber: 99, kind: "QUESTION", text: "C", guidance: null },
        ],
      },
    });

    const result = await generateProgramPlanReflections({ style, dayNumbers: [2, 3], totalDays: 10, programName: "P" });

    expect(result).toEqual([{ dayNumber: 2, kind: "QUESTION", text: "A", guidance: null }]);
  });
});
