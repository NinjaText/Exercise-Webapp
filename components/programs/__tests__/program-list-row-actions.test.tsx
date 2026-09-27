import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/programs",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/actions/program-actions", () => ({}));
vi.mock("@/actions/collection-actions", () => ({}));
vi.mock("@/components/programs/create-program-menu", () => ({ CreateProgramMenu: () => null }));

import { ProgramListClient } from "../program-list-client";

const program = {
  id: "p1",
  name: "Knee rehab",
  isTemplate: true,
  isGlobal: false,
  isPublic: false,
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  trainer: { id: "t1", firstName: "Tess", lastName: "Trainer" },
  client: null,
  workouts: [],
  _count: { workouts: 3 },
  tags: [],
  status: "ACTIVE",
  isFavorite: false,
};

function classesOf(tag: string) {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

const HIT_SLOP = ["size-8", "pointer-coarse:size-11"];

describe("program library row actions", () => {
  const html = renderToStaticMarkup(<ProgramListClient programs={[program]} />);

  it("gives favorite, view and actions a 44px touch target", () => {
    const star = (html.match(/<button[^>]*>/g) ?? []).find((t) => t.includes('title="Add to favorites"'));
    const view = (html.match(/<a [^>]*>/g) ?? []).find((t) => t.includes('title="View program"'));
    const menu = (html.match(/<button[^>]*>/g) ?? []).find((t) => t.includes('aria-label="Program actions"'));
    for (const tag of [star, view, menu]) {
      expect(tag).toBeTruthy();
      expect(classesOf(tag!)).toEqual(expect.arrayContaining(HIT_SLOP));
    }
    expect(classesOf(star!)).toEqual(
      expect.arrayContaining(["pointer-fine:opacity-0", "pointer-fine:group-hover:opacity-100", "pointer-fine:focus-visible:opacity-100"])
    );
    expect(classesOf(view!)).toEqual(
      expect.arrayContaining(["pointer-fine:opacity-0", "pointer-fine:group-hover:opacity-100", "pointer-fine:focus-visible:opacity-100"])
    );
  });

  it("spaces the three actions apart on touch", () => {
    expect(html).toContain('class="flex items-center justify-end gap-1 pointer-coarse:gap-4"');
  });
});
