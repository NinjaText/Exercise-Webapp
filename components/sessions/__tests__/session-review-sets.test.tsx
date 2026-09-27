import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionReviewSets, buildSetReviewRows, isCouldntComplete, type ReviewSetLog } from "../session-review-sets";

const log = (overrides: Partial<ReviewSetLog> & { setIndex: number }): ReviewSetLog => ({
  actualReps: null,
  actualDuration: null,
  actualWeight: null,
  notes: null,
  ...overrides,
});

describe("buildSetReviewRows", () => {
  it("pairs each prescribed set with its log by setIndex", () => {
    const rows = buildSetReviewRows({
      isCircuit: false,
      setCount: 3,
      exerciseSets: [
        { targetReps: 10, targetDuration: null },
        { targetReps: null, targetDuration: 30 },
        { targetReps: null, targetDuration: null },
      ],
      setLogs: [
        log({ setIndex: 1, actualDuration: 25 }),
        log({ setIndex: 0, actualReps: 8, actualWeight: 45 }),
      ],
    });
    expect(rows).toEqual([
      { index: 0, label: "Set 1", target: "10 reps", actual: "8", weight: "45 lbs", status: "done", note: null },
      { index: 1, label: "Set 2", target: "30s", actual: "25s", weight: "—", status: "done", note: null },
      { index: 2, label: "Set 3", target: "—", actual: "—", weight: "—", status: "not-logged", note: null },
    ]);
  });

  it("labels circuit rounds and fills rounds that have no prescribed set", () => {
    const rows = buildSetReviewRows({ isCircuit: true, setCount: 2, exerciseSets: [], setLogs: [] });
    expect(rows.map((r) => [r.label, r.target, r.status])).toEqual([
      ["Round 1", "—", "not-logged"],
      ["Round 2", "—", "not-logged"],
    ]);
  });

  it("marks zero reps with no duration as couldn't complete, keeping the client's note", () => {
    const [row] = buildSetReviewRows({
      isCircuit: false,
      setCount: 1,
      exerciseSets: [{ targetReps: 12, targetDuration: null }],
      setLogs: [log({ setIndex: 0, actualReps: 0, notes: "Knee pain" })],
    });
    expect(row).toMatchObject({ actual: "0", status: "couldnt-complete", note: "Knee pain" });
    expect(isCouldntComplete({ actualReps: 0, actualDuration: null })).toBe(true);
    expect(isCouldntComplete({ actualReps: 0, actualDuration: 10 })).toBe(false);
  });
});

describe("SessionReviewSets", () => {
  const rows = buildSetReviewRows({
    isCircuit: false,
    setCount: 2,
    exerciseSets: [{ targetReps: 10, targetDuration: null }, { targetReps: 10, targetDuration: null }],
    setLogs: [log({ setIndex: 0, actualReps: 10, actualWeight: 50 })],
  });

  it("renders phone cards below sm and the table from sm up", () => {
    const html = renderToStaticMarkup(<SessionReviewSets rows={rows} />);
    expect(html).toMatch(/<ul data-slot="set-cards" class="[^"]*\bsm:hidden\b/);
    expect(html).toMatch(/<div data-slot="set-table" class="[^"]*\bhidden\b[^"]*\bsm:block\b/);
  });

  it("shows one card per set with target, actual, weight and status", () => {
    const html = renderToStaticMarkup(<SessionReviewSets rows={rows} />);
    const cards = html.match(/<ul data-slot="set-cards"[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(cards.match(/<li /g)).toHaveLength(2);
    expect(cards).toContain("Set 1");
    expect(cards).toContain("Target 10 reps");
    expect(cards).toContain("50 lbs");
    expect(cards).toContain("Done");
    expect(cards).toContain("Not logged");
  });

  it("keeps the 5-column table with one row per set", () => {
    const html = renderToStaticMarkup(<SessionReviewSets rows={rows} />);
    const table = html.match(/<div data-slot="set-table"[\s\S]*?<\/table>/)?.[0] ?? "";
    expect(table.match(/<th /g)).toHaveLength(5);
    expect(table.match(/<tr class="border-t/g)).toHaveLength(2);
  });
});
