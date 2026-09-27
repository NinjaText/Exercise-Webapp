import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock("@/actions/program-actions", () => ({
  createProgramAction: vi.fn(),
  updateProgramAction: vi.fn(),
  syncProgramToMasterAction: vi.fn(),
  generateProgramAction: vi.fn(),
  getDistinctEquipmentAction: vi.fn(async () => ({ success: true, data: [] })),
}));
vi.mock("@/components/programs/program-builder", () => ({ ProgramBuilder: () => null }));
vi.mock("@/components/programs/plan-review-step", () => ({ PlanReviewStep: () => null }));
vi.mock("@/components/programs/client-details-panel", () => ({ ClientDetailsPanel: () => null }));

import { ProgramEditor } from "../program-editor";
import { GenerateProgramForm } from "../generate-program-form";

function classesOf(html: string, pattern: RegExp): string[] {
  return html.match(pattern)?.[1]?.split(" ") ?? [];
}

describe("program tools at narrow widths", () => {
  it("lets the editor's sticky action bar wrap instead of overflowing", () => {
    const html = renderToStaticMarkup(<ProgramEditor exercises={[]} />);
    const footer = classesOf(html, /<div class="([^"]*sticky[^"]*)">/);
    expect(footer).toEqual(expect.arrayContaining(["flex", "flex-wrap", "justify-end"]));
  });

  it("wraps each circuit row and keeps its counts and delete together on the second line", () => {
    const html = renderToStaticMarkup(<GenerateProgramForm clients={[]} />);
    const row = classesOf(html, /<div class="([^"]*rounded-lg border border-border bg-surface-muted p-3[^"]*)">/);
    expect(row).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    const counts = html.match(/<div class="flex basis-full flex-wrap items-center gap-2 sm:basis-auto sm:shrink-0 sm:flex-nowrap">([\s\S]*?)<\/button><\/div>/)?.[1] ?? "";
    for (const label of ["ex.", "sets", "s rest"]) expect(counts).toContain(`>${label}</span>`);
    expect(counts).toContain("lucide-trash2");
  });
});
