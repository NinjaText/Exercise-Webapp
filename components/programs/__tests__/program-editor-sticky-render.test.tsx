import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/program-actions", () => ({}));
vi.mock("@/actions/ai-program-actions", () => ({}));
vi.mock("../program-builder", () => ({ ProgramBuilder: () => null }));

import { ProgramEditor } from "../program-editor";

describe("ProgramEditor editor bar", () => {
  it("pins the title and save actions to the top of the scroll area", () => {
    const html = renderToStaticMarkup(<ProgramEditor exercises={[]} />);
    expect(html).toContain('data-slot="program-editor-bar"');
    expect(html).toMatch(/data-slot="program-editor-bar"[^>]*class="[^"]*sticky -top-4/);
    expect(html).toContain("New program");
    expect(html).toContain("Create program");
  });

  it("labels an existing program as an edit and saves changes", () => {
    const html = renderToStaticMarkup(
      <ProgramEditor exercises={[]} program={{ id: "p1", name: "Strength block", workouts: [] }} />
    );
    expect(html).toContain("Edit program");
    expect(html).toContain("Strength block");
    expect(html).toContain("Save changes");
  });

  it("starts clean: no unsaved-changes indicator on first render", () => {
    const html = renderToStaticMarkup(
      <ProgramEditor exercises={[]} program={{ id: "p1", name: "Strength block", workouts: [] }} />
    );
    expect(html).not.toContain('data-slot="unsaved-indicator"');
  });

  it("uses the caller's title, back link and notice", () => {
    const html = renderToStaticMarkup(
      <ProgramEditor
        exercises={[]}
        title="Edit global program"
        backHref="/admin/global-programs"
        notice="Changes apply after pushing an update."
      />
    );
    expect(html).toContain("Edit global program");
    expect(html).toContain('href="/admin/global-programs"');
    expect(html).toContain("Changes apply after pushing an update.");
  });

  it("puts settings in a sidebar beside the builder", () => {
    const html = renderToStaticMarkup(<ProgramEditor exercises={[]} />);
    expect(html).toContain('data-slot="program-editor-sidebar"');
  });
});
