import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ orgId: "org_1" })) }));
vi.mock("@/lib/current-user", () => ({
  requireRole: vi.fn(async () => ({ id: "t1", clerkOrgId: "org_1" })),
}));
vi.mock("@/lib/services/client.service", () => ({
  getClientIdsForTrainer: vi.fn(async () => ["c1"]),
  getClientDetail: vi.fn(async () => ({
    id: "c1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    imageUrl: null,
    phone: null,
    dateOfBirth: null,
    clientProfile: null,
  })),
}));
vi.mock("@/lib/services/session.service", () => ({
  getSessionsForClient: vi.fn(async () => []),
  getClientPastSessions: vi.fn(async () => []),
  computeAdherenceStats: vi.fn(() => ({ completionRate: 0, completed: 0, missed: 0, skipped: 0, avgRPE: null, total: 0 })),
}));
vi.mock("@/lib/services/program.service", () => ({ getProgramsForClient: vi.fn(async () => []) }));
vi.mock("@/lib/services/inbox.service", () => ({ getThreadItems: vi.fn(async () => []) }));
vi.mock("@/lib/services/exercise.service", () => ({ getExercisesForPicker: vi.fn(async () => []) }));
vi.mock("@/actions/organization-actions", () => ({ getOrganizationProfile: vi.fn(async () => null) }));
vi.mock("@/actions/client-progress-actions", () => ({ getClientProgressReportAction: vi.fn() }));
vi.mock("@/components/progress/client-progress-overview-dialog", () => ({ ClientProgressOverviewDialog: () => null }));
vi.mock("@/components/clients/assign-program-button", () => ({ AssignProgramButton: () => "ASSIGN_PROGRAM" }));
vi.mock("@/components/calendar/client-calendar", () => ({ ClientCalendar: () => null }));
vi.mock("@/components/clients/assigned-programs-list", () => ({ AssignedProgramsList: () => null }));
vi.mock("@/components/clients/client-adherence-summary", () => ({ ClientAdherenceSummary: () => null }));
vi.mock("@/components/clients/clinical-profile-card", () => ({ ClinicalProfileCard: () => null }));
vi.mock("@/components/clients/client-profile-dialog", () => ({ ClientProfileEditButton: () => null }));
vi.mock("@/components/messages/message-thread", () => ({ MessageThread: () => null }));
const phone = vi.hoisted(() => ({ isPhone: true }));
vi.mock("@/hooks/use-is-phone", () => ({ useIsPhone: () => phone.isPhone }));
// Menu items need an open Base UI menu; render them as plain elements so
// their classes and targets can be inspected.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    className,
    render,
    children,
  }: {
    className?: string;
    render?: React.ReactElement<{ href?: string }>;
    children: React.ReactNode;
  }) => (
    <div data-menu-item className={className} data-href={render?.props.href}>
      {children}
    </div>
  ),
}));
// Render the header's action slots directly (the real overflow menu only
// mounts its items when opened).
vi.mock("@/components/shared/page-header", () => ({
  PageHeader: (props: { primaryAction?: React.ReactNode; secondaryActions?: React.ReactNode; overflowLead?: React.ReactNode }) => (
    <header>
      <div data-slot="primary">{props.primaryAction}</div>
      <div data-slot="secondary">{props.secondaryActions}</div>
      <div data-slot="overflow-lead">{props.overflowLead}</div>
    </header>
  ),
}));

import ClientDetailPage from "../page";

function slot(html: string, name: string): string {
  return html.match(new RegExp(`<div data-slot="${name}">([\\s\\S]*?)</div>(?=<div data-slot|</header>)`))?.[1] ?? "";
}

async function render() {
  return renderToStaticMarkup(
    await ClientDetailPage({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({}) })
  );
}

describe("client detail header on phones", () => {
  it("keeps Assign program as the always-visible primary action", async () => {
    expect(slot(await render(), "primary")).toBe("ASSIGN_PROGRAM");
  });

  it("hides the Message and Progress buttons below sm", async () => {
    const secondary = slot(await render(), "secondary");
    const message = secondary.match(/<a [^>]*href="\/messages\/c1"[^>]*>/)?.[0] ?? "";
    expect(message).toMatch(/class="[^"]*\bhidden sm:inline-flex\b/);
    const progress = secondary.match(/<button [^>]*>(?:(?!<\/button>)[\s\S])*Progress<\/button>/)?.[0] ?? "";
    expect(progress).toMatch(/class="[^"]*\bhidden sm:inline-flex\b/);
  });

  it("puts phone-only Message and Progress items in the overflow menu on phones", async () => {
    phone.isPhone = true;
    const lead = slot(await render(), "overflow-lead");
    expect(lead).toMatch(/<div data-menu-item="true" data-href="\/messages\/c1">[\s\S]*?Message<\/div>/);
    expect(lead).toMatch(/<div data-menu-item="true">[\s\S]*?Progress<\/div>/);
  });

  it("leaves the phone-only overflow items out of the DOM above sm (no hidden focus stops)", async () => {
    phone.isPhone = false;
    try {
      expect(slot(await render(), "overflow-lead")).toBe("");
    } finally {
      phone.isPhone = true;
    }
  });
});
