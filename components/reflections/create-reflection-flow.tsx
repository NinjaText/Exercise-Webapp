"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Library,
  Loader2,
  PenLine,
  Send,
  Sparkles,
  Leaf,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFacet } from "@/components/shared/multi-select-facet";
import { cn } from "@/lib/utils";
import { MAX_FANOUT_ROWS, MAX_PROGRAM_PLAN_DAYS, MAX_RECURRING_SPAN_DAYS, WEEKDAY_OPTIONS } from "@/lib/reflections/constants";
import { expandScheduleDates, parseDateKey, utcDaysBetween, type ScheduleDates } from "@/lib/reflections/dates";
import { createReflectionAction } from "@/actions/reflection-actions";
import type { GeneratedReflection } from "@/lib/services/reflection-ai.service";
import { ReflectionArtwork } from "./reflection-artwork";
import { ReflectionEditorFields } from "./reflection-editor-fields";
import { LibraryPicker } from "./library-picker";
import { AiReflectionGenerator } from "./ai-reflection-generator";
import { defaultAiStyle, type AiStyleDraft } from "./ai-style-fields";
import { draftFromLibrary, emptyDraft, toContentInput, type ReflectionDraft } from "./reflection-draft";

export interface PickerClient {
  id: string;
  name: string;
}

export interface PlanProgramOption {
  id: string;
  name: string;
  isTemplate: boolean;
  clientName: string | null;
  /** Days that already have a reflection (Program plans picker). */
  reflectionCount?: number;
}

type Method = "write" | "ai" | "library";
type Audience = "all" | "selected" | "program";

const STEPS = ["Method", "Create", "Review", "Schedule", "Preview"] as const;

function localDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatDateKey(key: string): string {
  const date = parseDateKey(key);
  return date ? format(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), "EEE, MMM d") : key;
}

export function programOptionLabel(program: PlanProgramOption): string {
  return program.isTemplate ? `${program.name} (template)` : `${program.name}${program.clientName ? ` · ${program.clientName}` : ""}`;
}

/**
 * Trainer "Create reflection" stepper: method → AI / library → review & edit
 * → schedule (clients × dates, or a program day) → preview → save.
 */
export function CreateReflectionFlow({
  clients,
  programs,
}: {
  clients: PickerClient[];
  programs: PlanProgramOption[];
}) {
  const router = useRouter();
  const today = localDateKey(new Date());

  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [draft, setDraft] = useState<ReflectionDraft>(emptyDraft);
  const [aiStyle, setAiStyle] = useState<AiStyleDraft>(defaultAiStyle);
  const [libraryId, setLibraryId] = useState<string | null>(null);

  const [audience, setAudience] = useState<Audience>("all");
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"single" | "recurring">("single");
  const [date, setDate] = useState(today);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [programId, setProgramId] = useState<string>("");
  const [dayNumber, setDayNumber] = useState("1");

  const [isSaving, startSaving] = useTransition();

  const schedule: ScheduleDates =
    scheduleMode === "single" ? { mode: "single", date } : { mode: "recurring", weekdays, startDate, endDate };
  const dayCount = expandScheduleDates(schedule).length;
  const clientCount = audience === "all" ? clients.length : audience === "selected" ? clientIds.length : 0;
  const rowCount = clientCount * dayCount;
  const scheduleError = getScheduleError();

  function getScheduleError(): string | null {
    if (audience === "program") {
      const day = Number(dayNumber);
      if (!programId) return "Pick a program";
      if (!Number.isInteger(day) || day < 1 || day > MAX_PROGRAM_PLAN_DAYS) return `Day must be between 1 and ${MAX_PROGRAM_PLAN_DAYS}`;
      return null;
    }
    if (clientCount === 0) return audience === "all" ? "You don't have any clients yet" : "Select at least one client";
    if (scheduleMode === "recurring") {
      const start = parseDateKey(startDate);
      const end = parseDateKey(endDate);
      if (!start || !end) return "Pick a start and end date";
      const span = utcDaysBetween(start, end);
      if (span < 0) return "End date must be on or after the start date";
      if (span + 1 > MAX_RECURRING_SPAN_DAYS) return `A recurring schedule can span at most ${MAX_RECURRING_SPAN_DAYS} days`;
      if (weekdays.length === 0) return "Pick at least one weekday";
    } else if (!parseDateKey(date)) {
      return "Pick a date";
    }
    if (dayCount === 0) return "That schedule doesn't include any days";
    if (rowCount > MAX_FANOUT_ROWS) {
      return `That's ${rowCount} reflections — the limit is ${MAX_FANOUT_ROWS} per save. Shorten the range or pick fewer clients.`;
    }
    return null;
  }

  function chooseMethod(next: Method) {
    setMethod(next);
    if (next === "write") {
      setDraft({ ...emptyDraft(), source: "CUSTOM" });
      setStep(2);
    } else {
      setStep(1);
    }
  }

  function applyAiOption(option: GeneratedReflection) {
    setDraft({ ...emptyDraft(), kind: option.kind, text: option.text, guidance: option.guidance ?? "", theme: aiStyle.theme, source: "AI" });
    setStep(2);
  }

  function back() {
    if (step === 2 && method === "write") setStep(0);
    else setStep((current) => Math.max(0, current - 1));
  }

  function reset() {
    setStep(0);
    setMethod(null);
    setDraft(emptyDraft());
    setLibraryId(null);
    setClientIds([]);
  }

  function save() {
    const target =
      audience === "program"
        ? { type: "program" as const, programId, dayNumber: Number(dayNumber) }
        : { type: "clients" as const, audience, clientIds: audience === "selected" ? clientIds : [], schedule };

    startSaving(async () => {
      const result = await createReflectionAction({ content: toContentInput(draft), target });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        audience === "program"
          ? `Added to day ${dayNumber} of the program`
          : `Scheduled ${result.data.count} reflection${result.data.count === 1 ? "" : "s"}`
      );
      reset();
      router.refresh();
    });
  }

  const selectedProgram = programs.find((p) => p.id === programId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator current={step} skipped={method === "write" ? [1] : []} />

      <div className="rounded-xl bg-card p-4 shadow-xs ring-1 ring-border sm:p-6">
        {step === 0 && (
          <StepBody title="How would you like to create it?">
            <div className="grid gap-3 md:grid-cols-3">
              <MethodTile icon={PenLine} title="Write your own" description="Type a quote, question or prompt." onClick={() => chooseMethod("write")} />
              <MethodTile icon={Sparkles} title="Generate with AI" description="Pick a theme and tone, choose from 3 options." onClick={() => chooseMethod("ai")} />
              <MethodTile icon={Library} title="Prompt library" description="Browse ready-made reflections by theme." onClick={() => chooseMethod("library")} />
            </div>
          </StepBody>
        )}

        {step === 1 && method === "ai" && (
          <StepBody title="AI settings" description="Tell the AI what you're after, then pick the option you like.">
            <AiReflectionGenerator style={aiStyle} onStyleChange={setAiStyle} onUse={applyAiOption} />
          </StepBody>
        )}

        {step === 1 && method === "library" && (
          <StepBody title="Prompt library" description="Pick a reflection — you can edit it in the next step.">
            <LibraryPicker
              selectedId={libraryId}
              onPick={(entry) => {
                setLibraryId(entry.id);
                setDraft(draftFromLibrary(entry));
                setStep(2);
              }}
            />
          </StepBody>
        )}

        {step === 2 && (
          <StepBody title="Review & edit" description="Fine-tune the wording and choose how clients can respond.">
            <ReflectionEditorFields value={draft} onChange={setDraft} />
          </StepBody>
        )}

        {step === 3 && (
          <StepBody title="Schedule or assign">
            <div className="flex flex-col gap-5">
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who gets it">
                <ChoiceCard selected={audience === "all"} onClick={() => setAudience("all")} title="All clients" description={`${clients.length} client${clients.length === 1 ? "" : "s"}`} />
                <ChoiceCard selected={audience === "selected"} onClick={() => setAudience("selected")} title="Specific clients" description="Choose who receives it" />
                <ChoiceCard selected={audience === "program"} onClick={() => setAudience("program")} title="Specific program" description="Show it on a program day" />
              </div>

              {audience === "selected" && (
                <MultiSelectFacet
                  label="Clients"
                  icon={<Users className="size-4" />}
                  allLabel="Select clients"
                  values={clientIds}
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={setClientIds}
                  searchPlaceholder="Search clients…"
                />
              )}

              {audience !== "program" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Frequency">
                    <Button type="button" variant={scheduleMode === "single" ? "default" : "outline"} size="sm" aria-pressed={scheduleMode === "single"} onClick={() => setScheduleMode("single")}>
                      Single day
                    </Button>
                    <Button type="button" variant={scheduleMode === "recurring" ? "default" : "outline"} size="sm" aria-pressed={scheduleMode === "recurring"} onClick={() => setScheduleMode("recurring")}>
                      Recurring
                    </Button>
                  </div>

                  {scheduleMode === "single" ? (
                    <div className="flex max-w-xs flex-col gap-2">
                      <Label htmlFor="reflection-date">Date</Label>
                      <Input id="reflection-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <fieldset>
                        <legend className="mb-2 text-label text-foreground">Repeat on</legend>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <Button
                              key={day.value}
                              type="button"
                              size="sm"
                              variant={weekdays.includes(day.value) ? "default" : "outline"}
                              className="min-w-12"
                              aria-pressed={weekdays.includes(day.value)}
                              onClick={() =>
                                setWeekdays((current) =>
                                  current.includes(day.value) ? current.filter((d) => d !== day.value) : [...current, day.value]
                                )
                              }
                            >
                              {day.short}
                            </Button>
                          ))}
                        </div>
                      </fieldset>
                      <div className="grid max-w-md gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="reflection-start">Start date</Label>
                          <Input id="reflection-start" type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="reflection-end">End date</Label>
                          <Input id="reflection-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reflection-program">Program</Label>
                    {programs.length === 0 ? (
                      <p className="text-body text-muted-foreground">You don&apos;t have any scheduled programs yet.</p>
                    ) : (
                      <Select value={programId} onValueChange={(next) => setProgramId(next ?? "")}>
                        <SelectTrigger id="reflection-program">
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
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reflection-day">Day</Label>
                    <Input
                      id="reflection-day"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_PROGRAM_PLAN_DAYS}
                      value={dayNumber}
                      onChange={(e) => setDayNumber(e.target.value)}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground sm:col-span-2">
                    Day 1 is the program&apos;s start date. Setting it on a template applies to every client the template is assigned to.
                  </p>
                </div>
              )}

              <p className={cn("text-label", scheduleError ? "text-danger" : "text-muted-foreground")} aria-live="polite">
                {scheduleError ??
                  (audience === "program"
                    ? `Day ${dayNumber} of ${selectedProgram?.name ?? "the program"}`
                    : `${rowCount} reflection${rowCount === 1 ? "" : "s"}: ${clientCount} client${clientCount === 1 ? "" : "s"} × ${dayCount} day${dayCount === 1 ? "" : "s"}`)}
              </p>
            </div>
          </StepBody>
        )}

        {step === 4 && (
          <StepBody title="Preview" description="This is how it will look on your clients' dashboards.">
            <div className="grid overflow-hidden rounded-2xl ring-1 ring-border md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <ReflectionArtwork reflection={{ ...draft, author: draft.author || null }} className="md:min-h-64" />
              <div className="flex flex-col gap-3 bg-card p-5">
                {draft.guidance && <p className="text-body text-muted-foreground">{draft.guidance}</p>}
                <p className="text-heading text-foreground">How would you like to reflect today?</p>
                <PreviewTile icon={Leaf} title="Reflect on my own" />
                {draft.allowJournal && <PreviewTile icon={BookOpen} title="Journal on my own" />}
                {draft.allowShare && <PreviewTile icon={Send} title="Share with my trainer" />}
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-label text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {audience === "program"
                ? `Day ${dayNumber} of ${selectedProgram?.name ?? "the program"}`
                : `${audience === "all" ? "All clients" : `${clientCount} client${clientCount === 1 ? "" : "s"}`} · ${
                    scheduleMode === "single"
                      ? formatDateKey(date)
                      : `${dayCount} day${dayCount === 1 ? "" : "s"} from ${formatDateKey(startDate)} to ${formatDateKey(endDate)}`
                  }`}
            </p>
          </StepBody>
        )}

        {step > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={back} disabled={isSaving}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {step === 2 && (
              <Button type="button" onClick={() => setStep(3)} disabled={draft.text.trim().length === 0}>
                Next: schedule
                <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 3 && (
              <Button type="button" onClick={() => setStep(4)} disabled={Boolean(scheduleError)}>
                Next: preview
                <ArrowRight className="size-4" />
              </Button>
            )}
            {step === 4 && (
              <Button type="button" onClick={save} disabled={isSaving || Boolean(scheduleError)}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save reflection
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ current, skipped }: { current: number; skipped: number[] }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Steps">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const isSkipped = skipped.includes(index);
        return (
          <li key={label} className="flex shrink-0 items-center gap-1">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full px-2.5 py-1 text-label",
                active && "bg-brand-soft text-brand",
                done && !isSkipped && "text-foreground",
                (!done && !active) || isSkipped ? "text-muted-foreground" : undefined,
                isSkipped && "line-through opacity-60"
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  active ? "bg-brand text-brand-foreground" : done ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                )}
              >
                {done && !isSkipped ? <Check className="size-3" /> : index + 1}
              </span>
              {label}
            </span>
            {index < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-border sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

function StepBody({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 duration-300 animate-in fade-in motion-reduce:animate-none">
      <div>
        <h2 className="text-heading text-foreground">{title}</h2>
        {description && <p className="mt-1 text-body text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function MethodTile({ icon: Icon, title, description, onClick }: { icon: LucideIcon; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors outline-none hover:border-brand-border hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:p-5"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-card">
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className="block text-label text-foreground">{title}</span>
        <span className="mt-0.5 block text-caption text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function ChoiceCard({ selected, onClick, title, description }: { selected: boolean; onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-brand-border aria-checked:bg-brand-soft motion-reduce:transition-none"
    >
      <span className="text-label text-foreground">{title}</span>
      <span className="text-caption text-muted-foreground">{description}</span>
    </button>
  );
}

function PreviewTile({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-label text-foreground">{title}</span>
    </div>
  );
}
