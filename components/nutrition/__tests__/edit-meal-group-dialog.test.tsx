import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/nutrition-actions", () => ({
  updateMealGroupAction: vi.fn(),
  estimateMealMacrosBatchAction: vi.fn(),
}));

import { EditMealGroupDialog } from "../edit-meal-group-dialog";

function classesOf(tag: string) {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("EditMealGroupDialog trigger", () => {
  it("renders the edit trigger as a ghost icon-xs Button with a coarse-pointer hit area", () => {
    const html = renderToStaticMarkup(
      <EditMealGroupDialog clientId="c1" date={new Date("2026-09-20T00:00:00.000Z")} mealType="BREAKFAST" logs={[]} />
    );
    const tag = (html.match(/<button[^>]*>/g) ?? []).find((t) => t.includes('aria-label="Edit Breakfast"'));
    expect(tag).toBeTruthy();
    const classes = classesOf(tag!);
    expect(classes).toEqual(
      expect.arrayContaining(["size-7", "relative", "after:absolute", "pointer-coarse:after:-inset-2"])
    );
    expect(classes).toContain("text-muted-foreground");
    expect(html).toMatch(/<svg[^>]*class="[^"]*lucide-pencil[^"]*size-3\.5/);
  });
});
