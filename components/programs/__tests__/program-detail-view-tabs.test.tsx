import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

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

vi.mock("@/components/shared/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/providers/native-provider", () => ({ useNative: () => ({ isNative: false }) }));

// Base UI unmounts hidden tab panels unless keepMounted is set; record what each panel gets.
const panels: Record<string, { keepMounted?: boolean }> = {};
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: () => null,
  TabsTrigger: () => null,
  TabsContent: ({ value, keepMounted, children }: { value: string; keepMounted?: boolean; children: React.ReactNode }) => {
    panels[value] = { keepMounted };
    return <div>{children}</div>;
  },
}));

import { ProgramDetailView } from "../program-detail-view";

describe("ProgramDetailView tabs", () => {
  it("keeps the Overview panel mounted so the accordion's expanded state survives a Schedule round trip", () => {
    renderToStaticMarkup(
      <ProgramDetailView
        program={{ id: "p", name: "P", workouts: [{ id: "w1", name: "A", weekIndex: 0, dayIndex: 0, blocks: [] }] }}
        isTrainer
        clients={[]}
        sessions={[]}
      />
    );
    expect(panels.overview?.keepMounted).toBe(true);
  });
});
