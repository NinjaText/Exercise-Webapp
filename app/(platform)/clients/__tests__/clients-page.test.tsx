import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/current-user", () => ({
  requireRole: vi.fn(async () => ({ id: "t1", clerkOrgId: null })),
}));
vi.mock("@/lib/services/client.service", () => ({
  getClientsForTrainer: vi.fn(async () => [
    {
      id: "c1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      imageUrl: null,
      isActive: true,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  ]),
}));
vi.mock("@/lib/services/invitation.service", () => ({ getOrgInvitations: vi.fn(async () => []) }));
vi.mock("@/components/clients/add-client-dialog", () => ({ AddClientDialog: () => null }));
vi.mock("@/components/clients/client-search", () => ({ ClientSearch: () => null }));
vi.mock("@/components/clients/client-archived-toggle", () => ({ ClientArchivedToggle: () => null }));
vi.mock("@/components/clients/client-actions-menu", () => ({ ClientActionsMenu: () => null }));
vi.mock("@/components/shared/invitations-table", () => ({ InvitationsTable: () => null }));
vi.mock("@/components/clients/client-card-list", () => ({
  ClientCardList: ({ clients }: { clients: { id: string }[] }) => `CARD_LIST:${clients.map((c) => c.id).join(",")}`,
}));
vi.mock("@/components/shared/data-list", () => ({
  DataList: ({ data }: { data: { id: string }[] }) => `DATA_LIST:${data.map((c) => c.id).join(",")}`,
}));

import ClientsPage from "../page";

describe("clients page", () => {
  it("shows the card list below sm and the table from sm up, with the same clients", async () => {
    const html = renderToStaticMarkup(await ClientsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('<div class="sm:hidden">CARD_LIST:c1</div>');
    expect(html).toContain('<div class="hidden sm:block">DATA_LIST:c1</div>');
  });
});
