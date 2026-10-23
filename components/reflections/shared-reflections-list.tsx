import Link from "next/link";
import { format } from "date-fns";
import { MessageSquare, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export interface SharedReflectionView {
  id: string;
  clientId: string;
  clientName: string;
  promptText: string | null;
  promptAuthor: string | null;
  body: string;
  createdAt: Date;
}

/**
 * Reflections clients chose to share with the trainer. Only SHARED journal
 * entries ever reach this component (journalService.listSharedEntriesForTrainer).
 */
export function SharedReflectionsList({
  entries,
  showClient = true,
}: {
  entries: SharedReflectionView[];
  showClient?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={Inbox}
        title="Nothing shared yet"
        description="When a client shares a reflection with you, it appears here and in your inbox."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Shared reflections">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-xl bg-card p-4 shadow-xs ring-1 ring-border">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-label text-foreground">
              {showClient ? entry.clientName : "Shared reflection"}
              <span className="font-normal text-muted-foreground"> · {format(entry.createdAt, "MMM d")}</span>
            </p>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/messages/${entry.clientId}`}>
                <MessageSquare className="size-4" />
                Reply
              </Link>
            </Button>
          </div>
          {entry.promptText && (
            <blockquote className="mt-2 border-l-2 border-brand-border pl-3 text-body text-muted-foreground italic">
              {entry.promptText}
              {entry.promptAuthor && <span className="not-italic"> — {entry.promptAuthor}</span>}
            </blockquote>
          )}
          <p className="mt-2 line-clamp-6 text-body whitespace-pre-wrap text-foreground">{entry.body}</p>
        </li>
      ))}
    </ul>
  );
}
