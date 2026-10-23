import { describe, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/actions/journal-actions", () => ({ saveTodaysReflectionEntryAction: vi.fn() }));
import { renderToStaticMarkup } from "react-dom/server";
import { TodaysReflectionCard, type TodaysReflectionCardData } from "../todays-reflection-card";

function render(overrides: Partial<TodaysReflectionCardData> = {}) {
  const data: TodaysReflectionCardData = {
    dateKey: "2026-10-22",
    ref: { reflectionId: null, libraryId: "mindset-03" },
    reflection: { kind: "QUOTE", text: "The best way out is always through.", author: "Robert Frost", guidance: null, imageUrl: null },
    canJournal: true,
    canShare: true,
    trainerName: "Sam Coach",
    todaysEntry: null,
    ...overrides,
  };
  return renderToStaticMarkup(<TodaysReflectionCard data={data} />);
}

describe("TodaysReflectionCard", () => {
  it("shows the reflection and all three options", () => {
    const html = render();

    expect(html).toContain("The best way out is always through.");
    expect(html).toContain("Robert Frost");
    expect(html).toContain("Reflect on my own");
    expect(html).toContain("Journal on my own");
    expect(html).toContain("Share with my trainer");
    expect(html).toContain("Sam Coach can read it and reply.");
  });

  it("hides journal and share when they aren't allowed", () => {
    const html = render({ canJournal: false, canShare: false });

    expect(html).toContain("Reflect on my own");
    expect(html).not.toContain("Journal on my own");
    expect(html).not.toContain("Share with my trainer");
  });

  it("shows the already-journaled state", () => {
    expect(render({ todaysEntry: { visibility: "PRIVATE" } })).toContain("Journaled today");
    expect(render({ todaysEntry: { visibility: "SHARED" } })).toContain("Shared with your trainer today");
  });

  it("renders the trainer's image when there is one", () => {
    const html = render({
      reflection: { kind: "PROMPT", text: "Write it down.", author: null, guidance: "Two minutes is enough.", imageUrl: "https://cdn.example.com/r.png" },
    });

    expect(html).toContain('src="https://cdn.example.com/r.png"');
    expect(html).toContain("Two minutes is enough.");
  });
});
