import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/program-actions", () => ({
  generateProgramAction: vi.fn(),
  getDistinctEquipmentAction: vi.fn(async () => ({ success: true, data: [] })),
}));

import { GenerateProgramForm } from "../generate-program-form";
import { NATIVE_SELECT_CLASS } from "@/lib/ui/native-select";

const clients = [
  { id: "c1", firstName: "Ada", lastName: "Lovelace" },
] as unknown as Parameters<typeof GenerateProgramForm>[0]["clients"];

describe("GenerateProgramForm", () => {
  it("associates every native select and textarea with its label", () => {
    const html = renderToStaticMarkup(<GenerateProgramForm clients={clients} />);
    for (const id of [
      "generate-client",
      "generate-program-type",
      "generate-session-duration",
      "generate-days",
      "subjective",
      "trainerPrompt",
      "notes",
    ]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("uses the shared native select class", () => {
    const html = renderToStaticMarkup(<GenerateProgramForm clients={clients} />);
    expect(html).toContain(`class="${NATIVE_SELECT_CLASS}"`);
  });
});
