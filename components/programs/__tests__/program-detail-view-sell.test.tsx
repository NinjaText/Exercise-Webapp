import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The Sell action lives in PageHeader's overflow dropdown, whose items are not
// in the static markup; this stand-in lists the overflow labels instead.
vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ overflow }: { overflow?: { label: string }[] }) => (
    <ul data-testid="overflow">{overflow?.map((o) => <li key={o.label}>{o.label}</li>)}</ul>
  ),
}));
vi.mock("@/components/programs/sell-program-dialog", () => ({
  SellProgramDialog: () => <div>SELL_DIALOG_MOUNTED</div>,
}));
vi.mock("@/components/programs/assign-program-dialog", () => ({ AssignProgramDialog: () => null }));
vi.mock("@/components/programs/program-schedule-view", () => ({ ProgramScheduleView: () => null }));
vi.mock("@/components/programs/client-program-schedule-view", () => ({ ClientProgramScheduleView: () => null }));
vi.mock("@/components/admin/program-actions-menu", () => ({ ProgramActionsMenu: () => null }));
vi.mock("@/components/exercises/universal-video-player", () => ({ UniversalVideoPlayer: () => null }));
vi.mock("@/components/voice-memo/VoiceMemoRecorder", () => ({ VoiceMemoRecorder: () => null }));
vi.mock("@/components/voice-memo/VoiceMemoPlayer", () => ({ VoiceMemoPlayer: () => null }));
vi.mock("@/actions/program-actions", () => ({ duplicateProgramAction: vi.fn() }));
vi.mock("@/actions/session-v2-actions", () => ({ startOnDemandWorkoutAction: vi.fn() }));
vi.mock("@/actions/voice-memo-actions", () => ({ getWorkoutVoiceMemos: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const native = { isNative: false };
vi.mock("@/components/providers/native-provider", () => ({ useNative: () => native }));

import { ProgramDetailView } from "../program-detail-view";

function render() {
  return renderToStaticMarkup(
    <ProgramDetailView
      program={{ id: "prog-1", name: "Template", isTemplate: true, clientId: null, workouts: [] }}
      isTrainer
      clients={[]}
      sessions={[]}
    />
  );
}

describe("ProgramDetailView sell action", () => {
  beforeEach(() => {
    native.isNative = false;
  });

  it("offers Sell this program on the web", () => {
    const html = render();
    expect(html).toContain("Sell this program");
    expect(html).toContain("SELL_DIALOG_MOUNTED");
  });

  it("hides the Sell action and its price dialog inside the native app", () => {
    native.isNative = true;
    const html = render();
    expect(html).not.toContain("Sell this program");
    expect(html).not.toContain("SELL_DIALOG_MOUNTED");
    expect(html).toContain("Duplicate");
  });
});
