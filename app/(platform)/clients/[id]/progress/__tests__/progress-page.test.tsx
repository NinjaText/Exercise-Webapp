import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/current-user", () => ({ requireRole: vi.fn(async () => ({ id: "t1" })) }));
vi.mock("@/lib/services/client.service", () => ({
  getClientIdsForTrainer: vi.fn(async () => ["c1"]),
  getClientDetail: vi.fn(async () => ({
    id: "c1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    imageUrl: null,
  })),
}));
vi.mock("@/lib/services/progress.service", () => ({
  getProgressPhotos: vi.fn(async () => [{ id: "p1" }, { id: "p2" }]),
  getBodyMetrics: vi.fn(async () => []),
  getBodyMetricTypes: vi.fn(async () => ["weight"]),
}));
vi.mock("@/lib/services/clinical-note.service", () => ({ getNotesForClient: vi.fn(async () => []) }));
vi.mock("@/components/progress/photos-tab", () => ({ PhotosTab: () => null }));
vi.mock("@/components/progress/metrics-tab", () => ({ MetricsTab: () => null }));
vi.mock("@/components/progress/soap-notes-tab", () => ({ SoapNotesTab: () => null }));

import ClientProgressPage from "../page";

async function render() {
  return renderToStaticMarkup(await ClientProgressPage({ params: Promise.resolve({ id: "c1" }) }));
}

describe("client progress page on phones", () => {
  it("gives each tab a short phone label and keeps the full label from sm up", async () => {
    const html = await render();
    for (const [short, long] of [
      ["Photos (2)", "Progress photos (2)"],
      ["Metrics (1)", "Body metrics (1)"],
      ["Notes (0)", "Clinical notes — SOAP (0)"],
    ]) {
      expect(html).toContain(`<span class="sm:hidden">${short}</span>`);
      expect(html).toContain(`<span class="hidden sm:inline">${long}</span>`);
    }
  });
});
