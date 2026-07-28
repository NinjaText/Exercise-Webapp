import { StickyNote } from "lucide-react";
import { CommentThread } from "./comment-thread";

interface Comment {
  id: string;
  body: string;
  logId: string | null;
  createdAt: Date | string;
  author: { id: string; firstName: string; lastName: string; role: "TRAINER" | "CLIENT" };
}

interface DayNotesCardProps {
  clientId: string;
  date: Date;
  comments: Comment[];
}

export function DayNotesCard({ clientId, date, comments }: DayNotesCardProps) {
  const dayComments = comments.filter((c) => !c.logId);

  return (
    <div className="rounded-xl p-4 ring-1 ring-border/50">
      <div className="mb-3 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Day notes</p>
      </div>
      <CommentThread
        clientId={clientId}
        date={date}
        comments={dayComments}
        placeholder="Leave a note about today"
        forceExpanded
      />
    </div>
  );
}
