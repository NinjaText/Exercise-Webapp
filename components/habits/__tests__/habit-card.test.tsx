import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/habit-actions", () => ({ logHabitAction: vi.fn(), deleteHabitAction: vi.fn() }));

import { HabitCard } from "../habit-card";

const habit = { id: "h1", name: "Walk", icon: null, targetValue: null, unit: null, logs: [] };

function classesOf(tag: string) {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("HabitCard delete trigger", () => {
  it("is a 32px button that grows to 44px on touch and stays visible without hover", () => {
    const html = renderToStaticMarkup(<HabitCard habit={habit} showDelete />);
    const tag = (html.match(/<button[^>]*>/g) ?? []).find((t) => t.includes('aria-label="Remove habit"'));
    expect(tag).toBeTruthy();
    expect(classesOf(tag!)).toEqual(
      expect.arrayContaining(["size-8", "pointer-coarse:size-11", "[@media(hover:none)]:opacity-100", "hover:text-destructive"])
    );
  });
});
