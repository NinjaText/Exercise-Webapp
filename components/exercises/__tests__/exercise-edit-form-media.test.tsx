import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/actions/exercise-actions", () => ({
  updateExerciseAction: vi.fn(),
  addExerciseMediaAction: vi.fn(),
  deleteExerciseMediaAction: vi.fn(),
}));

import { ExerciseEditForm } from "../exercise-edit-form";

const exercise = {
  id: "ex1",
  name: "Squat",
  description: null,
  bodyRegion: ["legs"],
  musclesTargeted: [],
  difficultyLevel: null,
  equipmentRequired: [],
  contraindications: [],
  instructions: null,
  videoUrl: null,
  imageUrl: "https://example.com/img.jpg",
  isActive: true,
  isAssessment: false,
  media: [
    {
      id: "m1",
      mediaType: "image",
      url: "https://example.com/m1.jpg",
      thumbnailUrl: null,
      altText: null,
    },
  ],
};

/** Pulls every `<button ...>` open tag out of rendered HTML for attribute checks. */
function buttonTags(html: string) {
  return html.match(/<button[^>]*>/g) ?? [];
}

function classesOf(tag: string) {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("ExerciseEditForm media touch targets", () => {
  it("keeps the image preview clear button's absolute overlay positioning and pill shape", () => {
    const html = renderToStaticMarkup(<ExerciseEditForm exercise={exercise} />);
    const tag = buttonTags(html).find((t) => t.includes('aria-label="Clear image"'));
    expect(tag).toBeTruthy();
    const classes = classesOf(tag!);
    // Caller's `absolute` must win over the Button primitive's hit-slop `relative`.
    expect(classes).toContain("absolute");
    expect(classes).not.toContain("relative");
    expect(classes).toEqual(expect.arrayContaining(["rounded-full", "top-2", "right-2"]));
  });

  it("renders the media gallery delete button with an aria-label and the hit-slop signature", () => {
    const html = renderToStaticMarkup(<ExerciseEditForm exercise={exercise} />);
    const tag = buttonTags(html).find((t) => t.includes('aria-label="Remove media"'));
    expect(tag).toBeTruthy();
    const classes = classesOf(tag!);
    expect(classes).toEqual(
      expect.arrayContaining(["relative", "pointer-coarse:after:absolute", "pointer-coarse:after:-inset-1.5"])
    );
  });

  it("keeps the clear/remove icons at their original 14px (size-3.5 beats icon-xs's size-3 default)", () => {
    const html = renderToStaticMarkup(<ExerciseEditForm exercise={exercise} />);
    expect(html).toMatch(/<svg[^>]*class="[^"]*lucide-x[^"]*size-3\.5/);
    expect(html).toMatch(/<svg[^>]*class="[^"]*lucide-trash[^"]*size-3\.5/);
  });
});
