"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarRange, Dumbbell, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AI_PLAN_MAX_DAYS, REFLECTION_KIND_LABELS, type ReflectionKind } from "@/lib/reflections/constants";
import {
  deleteProgramDayAction,
  fillProgramPlanWithAiAction,
  getProgramPlanAction,
  upsertProgramDayAction,
} from "@/actions/reflection-actions";
import type { ProgramPlanDay } from "@/lib/services/reflection.service";
import { AiStyleFields, defaultAiStyle, toAiStyleInput, type AiStyleDraft } from "./ai-style-fields";
import { ReflectionEditDialog } from "./reflection-edit-dialog";
import { draftFromStored, emptyDraft, toContentInput, type ReflectionDraft } from "./reflection-draft";
import { programOptionLabel, type PlanProgramOption } from "./create-reflection-flow";

interface LoadedPlan {
  program: { id: string; name: string; isTemplate: boolean; totalDays: number };
  days: ProgramPlanDay[];
}

/**
 * Day-by-day reflection plan for one of the trainer's programs. Plans on a
 * template reach every client the template is assigned to.
 */
export function ProgramPlansPanel({ programs }: { programs: PlanProgramOption[] }) {
  const [programId, setProgramId] = useState("");
  const [plan, setPlan] = useState<LoadedPlan | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [editingDay, setEditingDay] = useState<ProgramPlanDay | null>(null);
  const [deletingDay, setDeletingDay] = useState<ProgramPlanDay | null>(null);
  const [fillOpen, setFillOpen] = useState(false);

  function load(id: string) {
    startLoading(async () => {
      const result = await getProgramPlanAction({ programId: id });
      if (!result.success) {
        toast.error(result.error);
        setPlan(null);
        return;
      }
      setPlan(result.data);
    });
  }

  async function saveDay(day: ProgramPlanDay, draft: ReflectionDraft): Promise<boolean> {
    const result = await upsertProgramDayAction({ programId, dayNumber: day.dayNumber, content: toContentInput(draft) });
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    toast.success(`Day ${day.dayNumber} saved`);
    load(programId);
    return true;
  }

  async function removeDay(day: ProgramPlanDay) {
    const result = await deleteProgramDayAction({ programId, dayNumber: day.dayNumber });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Day ${day.dayNumber} cleared`);
    load(programId);
  }

  if (programs.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No programs yet"
        description="Create a scheduled program or template, then plan a reflection for each of its days."
        actionLabel="Go to programs"
        actionHref="/programs"
      />
    );
  }

  const filledCount = plan?.days.filter((d) => d.reflection).length ?? 0;
  const emptyCount = plan ? plan.days.length - filledCount : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-2">
        <Label htmlFor="plan-program">Program</Label>
        <Select
          value={programId}
          onValueChange={(next) => {
            const id = next ?? "";
            setProgramId(id);
            setPlan(null);
            if (id) load(id);
          }}
        >
          <SelectTrigger id="plan-program">
            <SelectValue placeholder="Choose a program">
              {(value: string | null) => {
                const program = programs.find((p) => p.id === value);
                return program ? programOptionLabel(program) : "Choose a program";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {programs.map((program) => (
              <SelectItem key={program.id} value={program.id}>
                {programOptionLabel(program)}
                {program.reflectionCount ? ` · ${program.reflectionCount} planned` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && !plan && (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading plan…
        </p>
      )}

      {plan && (
        <SectionCard
          title={plan.program.name}
          icon={CalendarRange}
          description={`${filledCount} of ${plan.days.length} days planned${
            plan.program.isTemplate ? " · applies to every client on this template" : ""
          }`}
          action={
            <Button size="sm" variant="outline" onClick={() => setFillOpen(true)} disabled={emptyCount === 0}>
              <Sparkles className="size-4" />
              Fill empty days with AI
            </Button>
          }
          contentClassName="px-0 pb-0"
        >
          <ol className="divide-y divide-border border-t border-border" aria-label="Program days">
            {plan.days.map((day) => (
              <li key={day.dayNumber} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-32 sm:flex-col sm:items-start sm:justify-start">
                  <span className="text-label text-foreground tabular-nums">Day {day.dayNumber}</span>
                  {day.workoutName ? (
                    <span className="flex max-w-full items-center gap-1 truncate text-caption text-muted-foreground">
                      <Dumbbell className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{day.workoutName}</span>
                    </span>
                  ) : (
                    <span className="text-caption text-muted-foreground">Rest day</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {day.reflection ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          status={day.reflection.kind}
                          label={REFLECTION_KIND_LABELS[day.reflection.kind as ReflectionKind] ?? day.reflection.kind}
                          role="brand"
                          size="sm"
                          dot={false}
                        />
                        {day.reflection.source === "AI" && <StatusBadge status="AI_GENERATED" label="AI" size="sm" dot={false} />}
                      </div>
                      <p className="mt-1 text-body text-foreground">{day.reflection.text}</p>
                      {day.reflection.author && <p className="text-caption text-muted-foreground">— {day.reflection.author}</p>}
                    </>
                  ) : (
                    <p className="text-body text-muted-foreground">No reflection — clients see a library prompt.</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 self-end sm:self-start">
                  <Button size="sm" variant="ghost" onClick={() => setEditingDay(day)}>
                    {day.reflection ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                    {day.reflection ? "Edit" : "Add"}
                  </Button>
                  {day.reflection && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Clear day ${day.dayNumber}`} onClick={() => setDeletingDay(day)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      <ReflectionEditDialog
        open={editingDay !== null}
        onOpenChange={(open) => !open && setEditingDay(null)}
        title={editingDay ? `Day ${editingDay.dayNumber} reflection` : "Reflection"}
        initial={editingDay?.reflection ? draftFromStored(editingDay.reflection) : emptyDraft()}
        onSave={(draft) => (editingDay ? saveDay(editingDay, draft) : Promise.resolve(false))}
      />

      <ConfirmDialog
        open={deletingDay !== null}
        onOpenChange={(open) => !open && setDeletingDay(null)}
        title={deletingDay ? `Clear day ${deletingDay.dayNumber}?` : "Clear day?"}
        description="Clients on this program will see a library prompt that day instead."
        confirmLabel="Clear"
        variant="destructive"
        onConfirm={() => {
          if (deletingDay) void removeDay(deletingDay);
          setDeletingDay(null);
        }}
      />

      {plan && (
        <FillWithAiDialog
          open={fillOpen}
          onOpenChange={setFillOpen}
          programId={plan.program.id}
          emptyCount={emptyCount}
          onDone={() => load(plan.program.id)}
        />
      )}
    </div>
  );
}

function FillWithAiDialog({
  open,
  onOpenChange,
  programId,
  emptyCount,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  emptyCount: number;
  onDone: () => void;
}) {
  const [style, setStyle] = useState<AiStyleDraft>(defaultAiStyle);
  const [isFilling, startFilling] = useTransition();
  const batch = Math.min(emptyCount, AI_PLAN_MAX_DAYS);

  function fill() {
    startFilling(async () => {
      const result = await fillProgramPlanWithAiAction({ programId, ...toAiStyleInput(style) });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.remaining > 0
          ? `Filled ${result.data.count} days — ${result.data.remaining} still empty, run it again to continue`
          : `Filled ${result.data.count} days`
      );
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isFilling && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Fill empty days with AI</DialogTitle>
          <DialogDescription>
            {emptyCount > AI_PLAN_MAX_DAYS
              ? `Generates reflections for the next ${batch} empty days (of ${emptyCount}). Days you've already set are never changed.`
              : `Generates reflections for ${batch} empty day${batch === 1 ? "" : "s"}. Days you've already set are never changed.`}
          </DialogDescription>
        </DialogHeader>
        <AiStyleFields value={style} onChange={setStyle} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isFilling}>
            Cancel
          </Button>
          <Button onClick={fill} disabled={isFilling || batch === 0}>
            {isFilling ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isFilling ? "Writing reflections…" : `Fill ${batch} day${batch === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
