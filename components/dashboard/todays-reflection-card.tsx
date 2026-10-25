"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, CheckCircle2, Leaf, Lock, Send, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ReflectionArtwork, type ReflectionDisplay } from "@/components/reflections/reflection-artwork";
import { getTodaysReflectionCardAction, saveTodaysReflectionEntryAction } from "@/actions/journal-actions";
import { JOURNAL_BODY_MAX } from "@/lib/reflections/constants";
import { Skeleton } from "@/components/ui/skeleton";

export interface TodaysReflectionCardData {
  /** "YYYY-MM-DD" of the day this data is for. */
  dateKey: string;
  /** Which reflection is shown — sent back on save so the server snapshots exactly this one. */
  ref: { reflectionId: string | null; libraryId: string | null };
  reflection: ReflectionDisplay & { guidance: string | null };
  canJournal: boolean;
  /** Reflection allows sharing AND the client has messaging AND a trainer. */
  canShare: boolean;
  trainerName: string | null;
  /** The client's answer to today's prompt, if they already wrote one. */
  todaysEntry: { visibility: "PRIVATE" | "SHARED" } | null;
}

type Mode = "choose" | "reflect" | "reflected" | "journal" | "share";

const noopSubscribe = () => () => {};

function browserDateKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * "Today's Reflection" on the client dashboard: the prompt on the left and
 * three ways to engage with it on the right — reflect quietly (nothing
 * saved), journal privately, or share with the trainer (lands in their inbox
 * as a reflection message they can reply to).
 *
 * "Today" is the browser's local day, matching Up Next. The server renders
 * its UTC day; when the local day differs (evenings in the Americas, mornings
 * east of UTC) the card loads the local day's reflection instead.
 */
export function TodaysReflectionCard({ data }: { data: TodaysReflectionCardData }) {
  // Server snapshot = the server's day, so SSR and hydration always agree.
  const localKey = useSyncExternalStore(noopSubscribe, browserDateKey, () => data.dateKey);
  const [localDay, setLocalDay] = useState<{ key: string; data: TodaysReflectionCardData } | null>(null);

  if (localKey === data.dateKey) return <ReflectionCardBody data={data} />;
  if (localDay?.key === localKey) {
    return <ReflectionCardBody data={localDay.data} onSaved={() => setLocalDay(null)} />;
  }
  return (
    <LocalDayLoader
      key={localKey}
      dateKey={localKey}
      onLoaded={(loaded) => setLocalDay({ key: localKey, data: loaded ?? data })}
    />
  );
}

/** Fetches the card for the browser's local day; falls back to the server's day on failure. */
function LocalDayLoader({
  dateKey,
  onLoaded,
}: {
  dateKey: string;
  onLoaded: (data: TodaysReflectionCardData | null) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    getTodaysReflectionCardAction({ dateKey })
      .then((result) => {
        if (!cancelled) onLoaded(result.success ? result.data : null);
      })
      .catch(() => {
        if (!cancelled) onLoaded(null);
      });
    return () => {
      cancelled = true;
    };
    // onLoaded is recreated every render; the fetch only depends on the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  return (
    <section
      aria-label="Today's reflection"
      aria-busy
      className="grid overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-border md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <Skeleton className="min-h-56 rounded-none md:min-h-72" />
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </section>
  );
}

function ReflectionCardBody({ data, onSaved }: { data: TodaysReflectionCardData; onSaved?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [body, setBody] = useState("");
  const [isSaving, startSaving] = useTransition();

  const { reflection, canJournal, canShare, trainerName, todaysEntry } = data;

  function open(next: Mode) {
    setBody("");
    setMode(next);
  }

  function save(visibility: "PRIVATE" | "SHARED") {
    startSaving(async () => {
      const result = await saveTodaysReflectionEntryAction({
        body,
        visibility,
        dateKey: data.dateKey,
        reflectionId: data.ref.reflectionId,
        libraryId: data.ref.libraryId,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(visibility === "SHARED" ? "Shared with your trainer" : "Saved to your journal");
      setBody("");
      setMode("choose");
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Today's reflection"
      className="grid overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-border duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <ReflectionArtwork reflection={reflection} className="md:min-h-72" />

      <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="flex items-center gap-1.5 text-caption font-semibold tracking-wide text-muted-foreground uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            Today&apos;s reflection
          </p>
          {reflection.guidance && <p className="mt-2 text-body text-muted-foreground">{reflection.guidance}</p>}
        </div>

        {mode === "choose" && (
          <ChooseView
            canJournal={canJournal}
            canShare={canShare}
            trainerName={trainerName}
            todaysEntry={todaysEntry}
            onPick={open}
          />
        )}

        {mode === "reflect" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl bg-surface-muted p-6 text-center">
            <span className="relative flex size-14 items-center justify-center" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-success-soft motion-safe:animate-ping motion-safe:[animation-duration:3s]" />
              <Leaf className="relative size-6 text-success" />
            </span>
            <div>
              <p className="text-heading text-foreground">Take a moment</p>
              <p className="mt-1 text-body text-muted-foreground">
                Read it slowly, breathe, and sit with it for a minute. Nothing is saved — this one is just for you.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button onClick={() => setMode("reflected")}>I&apos;m done</Button>
            </div>
          </div>
        )}

        {mode === "reflected" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-success-soft p-6 text-center">
            <CheckCircle2 className="size-6 text-success" aria-hidden />
            <p className="text-heading text-success-foreground">Nice work taking a pause today.</p>
            <Button variant="link" size="sm" onClick={() => setMode("choose")}>
              See the other options
            </Button>
          </div>
        )}

        {(mode === "journal" || mode === "share") && (
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save(mode === "share" ? "SHARED" : "PRIVATE");
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 w-fit text-muted-foreground"
              onClick={() => setMode("choose")}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <label htmlFor="todays-reflection-body" className="text-label text-foreground">
              {mode === "share" ? `Share your thoughts with ${trainerName ?? "your trainer"}` : "Write in your journal"}
            </label>
            <Textarea
              id="todays-reflection-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={JOURNAL_BODY_MAX}
              rows={5}
              autoFocus
              placeholder="What comes to mind?"
              className="min-h-32 flex-1 resize-none"
              disabled={isSaving}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                {mode === "share" ? (
                  <>
                    <Send className="size-3.5" aria-hidden />
                    Your trainer can read and reply
                  </>
                ) : (
                  <>
                    <Lock className="size-3.5" aria-hidden />
                    Private — only you can see this
                  </>
                )}
              </p>
              <Button type="submit" disabled={isSaving || body.trim().length === 0}>
                {isSaving ? "Saving…" : mode === "share" ? "Share" : "Save to journal"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function ChooseView({
  canJournal,
  canShare,
  trainerName,
  todaysEntry,
  onPick,
}: {
  canJournal: boolean;
  canShare: boolean;
  trainerName: string | null;
  todaysEntry: TodaysReflectionCardData["todaysEntry"];
  onPick: (mode: Mode) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {todaysEntry && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2">
          <p className="flex items-center gap-1.5 text-label text-success-foreground">
            <CheckCircle2 className="size-4" aria-hidden />
            {todaysEntry.visibility === "SHARED" ? "Shared with your trainer today" : "Journaled today"}
          </p>
          <Link href="/journal" className="text-label text-primary hover:underline">
            View journal
          </Link>
        </div>
      )}
      <p className="text-heading text-foreground">How would you like to reflect today?</p>
      <div className="grid gap-2">
        <OptionTile
          icon={Leaf}
          title="Reflect on my own"
          description="Take a quiet moment. Nothing is saved."
          onClick={() => onPick("reflect")}
        />
        {canJournal && (
          <OptionTile
            icon={BookOpen}
            title="Journal on my own"
            description="Write privately — only you can see it."
            onClick={() => onPick("journal")}
          />
        )}
        {canShare && (
          <OptionTile
            icon={Send}
            title="Share with my trainer"
            description={`${trainerName ?? "Your trainer"} can read it and reply.`}
            onClick={() => onPick("share")}
          />
        )}
      </div>
    </div>
  );
}

function OptionTile({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors outline-none",
        "hover:border-brand-border hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-card">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-label text-foreground">{title}</span>
        <span className="block text-caption text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
