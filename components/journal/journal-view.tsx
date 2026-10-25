"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { BookOpen, Lock, MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { JOURNAL_BODY_MAX } from "@/lib/reflections/constants";
import {
  createJournalEntryAction,
  deleteJournalEntryAction,
  updateJournalEntryAction,
} from "@/actions/journal-actions";

export interface JournalEntryView {
  id: string;
  body: string;
  visibility: "PRIVATE" | "SHARED";
  promptText: string | null;
  promptAuthor: string | null;
  promptKind: string | null;
  /** ISO string of the UTC-anchored day. */
  entryDate: string;
  createdAt: string;
}

/** The client's journal: a composer for free-form entries and the entry list, newest first. */
export function JournalView({ entries }: { entries: JournalEntryView[] }) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, startSaving] = useTransition();

  function saveNew() {
    startSaving(async () => {
      // The browser's local day, so an evening entry lands on the day the client lives in.
      const result = await createJournalEntryAction({ body: draft, dateKey: format(new Date(), "yyyy-MM-dd") });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry saved");
      setDraft("");
      setComposing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="New entry"
        icon={Pencil}
        description="Free-form and private — only you can see it."
      >
        {!composing ? (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex w-full items-center gap-2 rounded-md border border-input bg-surface px-3 py-2.5 text-left text-body text-muted-foreground shadow-xs transition-colors outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Plus className="size-4" aria-hidden />
            What&apos;s on your mind today?
          </button>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveNew();
            }}
          >
            <Textarea
              aria-label="Journal entry"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={JOURNAL_BODY_MAX}
              rows={6}
              autoFocus
              placeholder="What's on your mind today?"
              disabled={isSaving}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setComposing(false);
                  setDraft("");
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || draft.trim().length === 0}>
                {isSaving ? "Saving…" : "Save entry"}
              </Button>
            </div>
          </form>
        )}
      </SectionCard>

      {entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Your journal is empty"
          description="Answer today's reflection from your dashboard, or write a free-form entry above."
        />
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Journal entries">
          {entries.map((entry) => (
            <li key={entry.id}>
              <JournalEntryCard entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function JournalEntryCard({ entry }: { entry: JournalEntryView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isPrivate = entry.visibility === "PRIVATE";

  function saveEdit() {
    startTransition(async () => {
      const result = await updateJournalEntryAction({ id: entry.id, body: draft });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry updated");
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteJournalEntryAction({ id: entry.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry deleted");
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl bg-card p-4 shadow-xs ring-1 ring-border sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <time dateTime={entry.entryDate} className="text-label text-foreground">
            {format(toLocalCalendarDate(entry.entryDate), "EEEE, MMM d, yyyy")}
          </time>
          {isPrivate ? (
            <StatusBadge status="PRIVATE" label="Private" role="neutral" size="sm" dot={false} />
          ) : (
            <StatusBadge status="SHARED" label="Shared with trainer" role="info" size="sm" dot={false} />
          )}
        </div>
        {isPrivate && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Entry actions" disabled={isPending} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setDraft(entry.body);
                  setEditing(true);
                }}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {entry.promptText && (
        <blockquote className="mt-3 border-l-2 border-brand-border pl-3 text-body text-muted-foreground italic">
          {entry.promptText}
          {entry.promptAuthor && <span className="not-italic"> — {entry.promptAuthor}</span>}
        </blockquote>
      )}

      {editing ? (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveEdit();
          }}
        >
          <Textarea
            aria-label="Edit entry"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={JOURNAL_BODY_MAX}
            rows={5}
            autoFocus
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || draft.trim().length === 0}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-body whitespace-pre-wrap text-foreground">{entry.body}</p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-caption text-muted-foreground">
        {isPrivate ? (
          <>
            <Lock className="size-3.5" aria-hidden />
            Only you can see this entry
          </>
        ) : (
          <>
            <Send className="size-3.5" aria-hidden />
            Sent to your trainer — reply in Messages
          </>
        )}
      </p>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this entry?"
        description="This permanently removes the entry from your journal."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={remove}
      />
    </article>
  );
}
