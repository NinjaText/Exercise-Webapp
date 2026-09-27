"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import {
  Pencil,
  Copy,
  UserPlus,
  Play,
  Dumbbell,
  Download,
  Printer,
  Tag,
  Mic,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction } from "@/actions/program-actions";
import { startOnDemandWorkoutAction } from "@/actions/session-v2-actions";
import { ProgramActionsMenu } from "@/components/admin/program-actions-menu";
import { AssignProgramDialog } from "@/components/programs/assign-program-dialog";
import { SellProgramDialog } from "@/components/programs/sell-program-dialog";
import { ProgramScheduleView } from "@/components/programs/program-schedule-view";
import { ClientProgramScheduleView } from "@/components/programs/client-program-schedule-view";
import { ProgramStructureReadonly } from "@/components/programs/program-structure-readonly";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { Capacitor } from "@capacitor/core";
import { useNative } from "@/components/providers/native-provider";
import { saveOrDownload } from "@/lib/native/download";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { aggregateProgramEquipment } from "@/lib/utils/program-equipment";
import { pickStartableSession } from "@/lib/utils/session-picker";
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";


interface ProgramDetailViewProps {
  program: Record<string, unknown>;
  isTrainer: boolean;
  clients: { id: string; firstName: string; lastName: string }[];
  sessions: Record<string, unknown>[];
  showAssignDialog?: boolean;
  /** Pre-selects a client in the assign dialog, e.g. when arriving from that client's profile. */
  initialAssignClientId?: string;
  trainerName?: string;
  adminMode?: boolean;
  editHref?: string;
  initialWorkoutId?: string;
  // startDate is optional because an on-demand Resource has no schedule —
  // the action resolves the program's type and enforces the requirement.
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate?: string | null;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
}

export function ProgramDetailView({
  program,
  isTrainer,
  clients,
  sessions,
  showAssignDialog = false,
  initialAssignClientId,
  trainerName: trainerNameProp,
  adminMode = false,
  editHref,
  initialWorkoutId,
  assignAction,
}: ProgramDetailViewProps) {
  const router = useRouter();
  const { isNative } = useNative();
  const [assignOpen, setAssignOpen] = useState(showAssignDialog);
  const [sellOpen, setSellOpen] = useState(false);
  const [startingWorkoutId, setStartingWorkoutId] = useState<string | null>(null);
  const workouts = (program.workouts as Record<string, unknown>[]) || [];
  const isResource = getProgramSchedulingType(program) === "ON_DEMAND";

  const trainerData = program.trainer as { firstName?: string; lastName?: string } | null;
  const trainerName = trainerNameProp ?? (trainerData ? `${trainerData.firstName ?? ""} ${trainerData.lastName ?? ""}`.trim() : "Trainer");

  const client = program.client as Record<string, string> | null;
  const clientId = program.clientId as string | null;
  // Use the trainer-curated program equipment list when available;
  // fall back to auto-detecting from exercises if the list is empty.
  const savedEquipment = (program.equipmentRequired as string[] | undefined) ?? [];
  const equipmentNeeded = savedEquipment.length > 0
    ? savedEquipment
    : aggregateProgramEquipment(workouts);
  const startableSession = !isTrainer && !isResource ? pickStartableSession(sessions, new Date()) : null;

  const [voiceMemoWorkout, setVoiceMemoWorkout] = useState<{ id: string; name: string } | null>(null);
  const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);

  async function handleStartResourceWorkout(workoutId: string) {
    if (!isResource || isTrainer || startingWorkoutId) return;
    setStartingWorkoutId(workoutId);
    try {
      const result = await startOnDemandWorkoutAction(workoutId);
      if (result.success) {
        router.push(`/sessions/${result.data.id}`);
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error("Could not start this resource. Please try again.");
    } finally {
      setStartingWorkoutId(null);
    }
  }

  useEffect(() => {
    if (!voiceMemoWorkout) return;
    setMemoLoading(true);
    setTrainerMemo(null);
    getWorkoutVoiceMemos(voiceMemoWorkout.id).then((result) => {
      if (result.success && result.data) setTrainerMemo(result.data.trainer);
      setMemoLoading(false);
    });
  }, [voiceMemoWorkout?.id]);

  async function handleDownloadPdf() {
    const res = await fetch(`/api/programs/${program.id as string}/pdf`);
    if (!res.ok) { toast.error("Failed to generate PDF"); return; }
    const blob = await res.blob();
    try {
      await saveOrDownload(blob, `${(program.name as string).replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`);
    } catch {
      toast.error("Failed to save PDF");
    }
  }

  async function handleDuplicate() {
    const r = await duplicateProgramAction(program.id as string);
    if (r.success) {
      toast.success("Duplicated");
      router.refresh();
    } else toast.error(r.error);
  }

  const isTemplate = program.isTemplate as boolean;
  const pdfUrl = `/api/programs/${program.id as string}/pdf`;

  const shareOverflow = [
    { label: "Duplicate", icon: Copy, onSelect: handleDuplicate },
    // Selling is web-only: the dialog shows prices and the public /p/<slug>
    // sales link, which store review treats as in-app purchase UI.
    ...(isTemplate && !clientId && !isNative
      ? [{ label: "Sell this program", icon: Tag, onSelect: () => setSellOpen(true) }]
      : []),
    { label: "Download PDF", icon: Download, onSelect: () => void handleDownloadPdf() },
    {
      label: "Print",
      icon: Printer,
      // The PDF route needs the session cookie, which the system browser
      // does not have, so on native fetch the PDF and hand it to the share
      // sheet instead (which offers Print).
      onSelect: () => (Capacitor.isNativePlatform() ? void handleDownloadPdf() : window.open(pdfUrl)),
    },
  ];

  const editButton = (
    <Button variant="outline" asChild>
      <Link href={editHref ?? `/programs/${program.id}/edit`}>
        <Pencil className="size-4" /> Edit
      </Link>
    </Button>
  );

  const primaryEditButton = (
    <Button asChild>
      <Link href={editHref ?? `/programs/${program.id}/edit`}>
        <Pencil className="size-4" /> Edit
      </Link>
    </Button>
  );

  const assignIsPrimary = (isTrainer || adminMode) && !clientId;

  return (
    <>
      <Tabs defaultValue="overview" className="gap-6">
        <PageHeader
          breadcrumb={
            adminMode
              ? [
                  { label: "Admin", href: "/admin" },
                  { label: "All Programs", href: "/admin/programs" },
                  { label: program.name as string },
                ]
              : [
                  { label: isTrainer ? "Programs" : "My Programs", href: "/programs" },
                  { label: program.name as string },
                ]
          }
          back={adminMode ? { label: "Back to programs", href: "/admin/programs" } : undefined}
          title={program.name as string}
          description={program.description as string | undefined}
          primaryAction={
            !isTrainer && !adminMode
              ? undefined
              : assignIsPrimary
                ? (
                  <Button onClick={() => setAssignOpen(true)}>
                    <UserPlus className="size-4" /> Assign
                  </Button>
                )
                : primaryEditButton
          }
          secondaryActions={
            isTrainer
              ? (assignIsPrimary ? editButton : undefined)
              : adminMode
                ? (
                  <>
                    {assignIsPrimary && editButton}
                    <ProgramActionsMenu
                      programId={program.id as string}
                      programName={(program.name as string) ?? "this program"}
                      isPublic={program.isPublic as boolean | undefined}
                      redirectTo="/admin/programs"
                    />
                  </>
                )
                : undefined
          }
          overflow={isTrainer ? shareOverflow : undefined}
          meta={
            <>
              <StatusBadge status={program.status as string} size="sm" />
              {isTemplate && <StatusBadge status="TEMPLATE" size="sm" dot={false} />}
              {client && (
                <span>
                  Assigned to {client.firstName} {client.lastName}
                </span>
              )}
              {!!program.startDate && (
                <span>
                  Starts {format(toLocalCalendarDate(program.startDate as string), "MMM d, yyyy")}
                </span>
              )}
              {adminMode && trainerName && <span>Owned by {trainerName}</span>}
            </>
          }
          tabs={
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
            </TabsList>
          }
        />

        {startableSession && (
          <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-xs ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-caption">Up next</p>
              <p className="truncate text-heading text-foreground">
                {((startableSession.workout as Record<string, unknown> | null)?.name as string) ?? "Next workout"}
              </p>
              <p className="text-body text-muted-foreground">
                {format(toLocalCalendarDate(startableSession.scheduledDate as string | Date), "EEEE, MMM d")}
              </p>
            </div>
            <Button className="h-11 shrink-0 sm:h-9" asChild>
              <Link href={`/sessions/${startableSession.id as string}`}>
                <Play className="size-4 fill-current" />
                Start Workout
              </Link>
            </Button>
          </div>
        )}

        {/* keepMounted: the accordion's expanded/highlight state lives in
            ProgramStructureReadonly and must survive a Schedule tab round trip. */}
        <TabsContent value="overview" keepMounted className="flex flex-col gap-4">
          {equipmentNeeded.length > 0 && (
            <SectionCard title="Equipment needed" icon={Dumbbell}>
              <div className="flex flex-wrap gap-2">
                {equipmentNeeded.map((eq) => (
                  <Badge key={eq} variant="secondary" className="text-xs">
                    {eq}
                  </Badge>
                ))}
              </div>
            </SectionCard>
          )}
          {workouts.length === 0 ? (
            <Card className="gap-0 py-0">
              <EmptyState
                icon={Dumbbell}
                title="No workouts yet"
                description="Edit this program to add workouts."
              />
            </Card>
          ) : (
            <ProgramStructureReadonly
              workouts={workouts}
              isResource={isResource}
              initialWorkoutId={initialWorkoutId}
              renderWorkoutAction={({ id: wId, name }) => (
                <>
                  {isResource && !isTrainer && (
                    <Button
                      size="sm"
                      className="mr-4"
                      disabled={startingWorkoutId !== null}
                      onClick={() => void handleStartResourceWorkout(wId)}
                    >
                      {startingWorkoutId === wId ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                      )}
                      {startingWorkoutId === wId ? "Starting..." : "Start Session"}
                    </Button>
                  )}
                  {isTrainer && (
                    <button
                      type="button"
                      className="mr-3 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      title="Voice note"
                      aria-label={`Voice note for ${name}`}
                      onClick={() => setVoiceMemoWorkout({ id: wId, name })}
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            />
          )}
        </TabsContent>
        <TabsContent value="schedule">
          {isTrainer || adminMode ? (
            <ProgramScheduleView
              rawWorkouts={workouts}
              rawSessions={sessions}
              trainerName={trainerName}
              readOnly={!isTrainer}
            />
          ) : (
            <ClientProgramScheduleView rawSessions={sessions} />
          )}
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      <AssignProgramDialog
        programId={program.id as string}
        programName={program.name as string}
        clients={clients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        schedulingType={program.schedulingType as string | null | undefined}
        assignAction={assignAction}
        initialClientId={initialAssignClientId}
      />

      {!isNative && (
        <SellProgramDialog
          programId={program.id as string}
          open={sellOpen}
          onOpenChange={setSellOpen}
        />
      )}

      {/* Voice Memo Dialog */}
      <Dialog open={!!voiceMemoWorkout} onOpenChange={(open) => !open && setVoiceMemoWorkout(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voice note — {voiceMemoWorkout?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {memoLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {trainerMemo && (
                  <VoiceMemoPlayer memo={trainerMemo} authorName={trainerName} />
                )}
                <VoiceMemoRecorder
                  workoutId={voiceMemoWorkout?.id ?? ""}
                  role="TRAINER"
                  onSuccess={(memo) => setTrainerMemo(memo)}
                  existingMemo={trainerMemo ?? undefined}
                />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
