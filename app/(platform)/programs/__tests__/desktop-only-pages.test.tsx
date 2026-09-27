import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk-1", orgId: "org-1" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/programs",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ id: "t1", role: "TRAINER", clerkOrgId: "org-1" })),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/lib/current-user", () => ({ requireRole: vi.fn(async () => ({ id: "t1", clerkOrgId: "org-1" })) }));
vi.mock("@/lib/services/program.service", () => ({
  getProgramById: vi.fn(async () => ({
    id: "p1",
    name: "Knee Rehab",
    trainerId: "t1",
    schedulingType: "SCHEDULED",
    workouts: [
      { id: "w1", name: "Mobility Day", weekIndex: 0, dayIndex: 0, blocks: [] },
    ],
  })),
}));
vi.mock("@/lib/services/exercise.service", () => ({
  getExercises: vi.fn(async () => []),
  getExerciseUsageForTrainer: vi.fn(async () => []),
  rankExercisesByUsage: vi.fn(() => []),
  getExercisesForPicker: vi.fn(async () => []),
}));
vi.mock("@/lib/services/collection.service", () => ({ listCollections: vi.fn(async () => []) }));
vi.mock("@/lib/services/client.service", () => ({ getClientsForTrainer: vi.fn(async () => []) }));
vi.mock("@/actions/organization-actions", () => ({ getOrganizationProfile: vi.fn(async () => null) }));
vi.mock("@/components/exercises/universal-video-player", () => ({ UniversalVideoPlayer: () => null }));

// The tools themselves are out of scope here; each stand-in marks where it lands.
vi.mock("@/components/programs/program-editor", () => ({ ProgramEditor: () => <div>TOOL</div> }));
vi.mock("@/components/programs/generate-program-form", () => ({ GenerateProgramForm: () => <div>TOOL</div> }));
vi.mock("@/components/programs/program-brief-upload", () => ({ ProgramBriefUpload: () => <div>TOOL</div> }));

import EditProgramPage from "../[id]/edit/page";
import NewProgramPage from "../new/page";
import GenerateProgramPage from "../generate/page";
import ProgramBriefUploadPage from "../upload/page";

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

/** Review Focus 2: exactly one phone notice and one desktop tool block, never both or neither. */
function expectGated(html: string) {
  expect(count(html, 'data-slot="desktop-only-notice"')).toBe(1);
  expect(html).toMatch(/data-slot="desktop-only-notice"[^>]*class="[^"]*\bsm:hidden\b/);
  expect(count(html, 'class="hidden sm:block"')).toBe(1);
  expect(html).toContain('<div class="hidden sm:block"><div>TOOL</div></div>');
  expect(count(html, "TOOL")).toBe(1);
}

const searchParams = Promise.resolve({});

describe("desktop-only program tools on phones", () => {
  it("edit: notice, read-only structure on phones, editor from sm up", async () => {
    const html = renderToStaticMarkup(await EditProgramPage({ params: Promise.resolve({ id: "p1" }) }));
    expectGated(html);
    const phoneOnly = html.match(/<div class="sm:hidden">([\s\S]*?)<div class="hidden sm:block">/)?.[1] ?? "";
    expect(phoneOnly).toContain("Mobility Day");
    expect(count(html, 'class="sm:hidden"')).toBe(1);
  });

  it("new: notice only on phones, editor from sm up", async () => {
    const html = renderToStaticMarkup(await NewProgramPage({ searchParams }));
    expectGated(html);
    expect(html).not.toContain('class="sm:hidden"');
  });

  it("generate: notice on phones, form from sm up", async () => {
    expectGated(renderToStaticMarkup(await GenerateProgramPage({ searchParams })));
  });

  it("upload: notice on phones, uploader from sm up", async () => {
    expectGated(renderToStaticMarkup(await ProgramBriefUploadPage({ searchParams })));
  });
});
