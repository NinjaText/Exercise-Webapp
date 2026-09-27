import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The icon picker only renders once the dialog is open, and `AddHabitDialog`
// owns that boolean entirely as local state (no prop to force it open) — with
// this repo's node-env/renderToStaticMarkup test setup (no jsdom, so no click
// simulation), the picker buttons are unreachable through a normal render.
// Assert the source directly instead of pretending to exercise a DOM we can't
// reach: this pins the exact class list ruling 1's hit-slop targets.
const SOURCE = readFileSync(join(__dirname, "../add-habit-dialog.tsx"), "utf8");

describe("AddHabitDialog icon picker touch targets", () => {
  it("grows the icon picker buttons to 44px on coarse pointers without changing their visual size", () => {
    const match = SOURCE.match(
      /"flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all([^"]*)"/
    );
    expect(match).toBeTruthy();
    const classes = match![0].replace(/^"|"$/g, "").split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["h-10", "w-10", "pointer-coarse:size-11"])
    );
  });
});
