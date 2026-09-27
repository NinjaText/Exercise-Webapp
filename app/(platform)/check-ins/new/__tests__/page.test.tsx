import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/actions/checkin-actions", () => ({ createCheckInTemplateAction: vi.fn() }));

import NewCheckInTemplatePage from "../page";

/** Pulls every `<button ...>` open tag out of rendered HTML for attribute checks. */
function buttonTags(html: string) {
  return html.match(/<button[^>]*>/g) ?? [];
}

function classesOf(tag: string) {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("check-ins/new question row at narrow widths", () => {
  it("wraps the order/type/delete row instead of overflowing", () => {
    const html = renderToStaticMarkup(<NewCheckInTemplatePage />);
    expect(html).toContain('class="flex flex-wrap items-center gap-2"');
  });

  it("gives move up/down a 44px touch target and the remove button its coarse hit area", () => {
    const html = renderToStaticMarkup(<NewCheckInTemplatePage />);
    const tags = buttonTags(html);

    for (const label of ["Move question up", "Move question down"]) {
      const tag = tags.find((t) => t.includes(`aria-label="${label}"`));
      expect(tag, label).toBeTruthy();
      expect(classesOf(tag!)).toContain("pointer-coarse:size-11");
    }

    const remove = tags.find((t) => t.includes('aria-label="Remove question"'));
    expect(remove).toBeTruthy();
    expect(classesOf(remove!)).toEqual(
      expect.arrayContaining(["relative", "pointer-coarse:after:absolute", "pointer-coarse:after:-inset-1.5"])
    );
  });
});
