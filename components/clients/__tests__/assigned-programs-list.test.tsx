import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/actions/program-actions", () => ({ deleteClientProgramAction: vi.fn() }));

import { AssignedProgramsList } from "../assigned-programs-list";

const programs = [
  { id: "p1", name: "Knee rehab — phase 2", status: "ACTIVE", schedulingType: null, _count: { workouts: 6 } },
];

function classOf(html: string, slot: string): string[] {
  return (html.match(new RegExp(`data-slot="${slot}" class="([^"]*)"`))?.[1] ?? "").split(" ");
}

describe("AssignedProgramsList row on phones", () => {
  it("wraps the row instead of squeezing the name", () => {
    const html = renderToStaticMarkup(<AssignedProgramsList programs={programs} />);
    expect(classOf(html, "assigned-program-row")).toEqual(expect.arrayContaining(["flex-wrap", "gap-y-2"]));
  });

  it("keeps the scheduling pill and status badge together", () => {
    const html = renderToStaticMarkup(<AssignedProgramsList programs={programs} />);
    expect(classOf(html, "assigned-program-badges")).toContain("shrink-0");
  });

  it("uses the icon-sm button (with coarse-pointer hit-slop) for delete", () => {
    const html = renderToStaticMarkup(<AssignedProgramsList programs={programs} />);
    const del = html.match(/<button [^>]*aria-label="Delete Knee rehab — phase 2"[^>]*>/)?.[0] ?? "";
    expect(del).toContain("size-8");
    expect(del).toContain("pointer-coarse:after:-inset-1.5");
    expect(del).not.toContain("h-7 w-7");
  });
});
