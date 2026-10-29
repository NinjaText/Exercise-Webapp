import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils/dates";

type SessionRow = {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  overallPainLevel: number | null;
  notes: string | null;
  planTitle: string;
  exercisesCompleted: number;
  exercisesSkipped: number;
  exercisesTotal: number;
};

interface SessionHistoryProps {
  sessions: SessionRow[];
}

const columns: Column<SessionRow>[] = [
  { key: "date", header: "Date", render: (s) => formatDateTime(s.startedAt) },
  { key: "plan", header: "Plan", render: (s) => <span className="break-words">{s.planTitle}</span> },
  { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} size="sm" /> },
  {
    key: "exercises",
    header: "Exercises",
    render: (s) => (
      <span>
        {s.exercisesCompleted}/{s.exercisesTotal}
        {s.exercisesSkipped > 0 && (
          <span className="text-muted-foreground"> ({s.exercisesSkipped} skipped)</span>
        )}
      </span>
    ),
  },
  {
    key: "pain",
    header: "Pain",
    render: (s) => (s.overallPainLevel !== null ? `${s.overallPainLevel}/10` : "-"),
  },
  {
    key: "notes",
    // Hidden only on the cramped 640–767px table; phone cards keep the note.
    header: "Notes",
    className: "max-w-[200px] text-muted-foreground sm:truncate sm:max-md:hidden max-sm:col-span-2 max-sm:max-w-none",
    render: (s) => s.notes ?? "-",
  },
];

export function SessionHistory({ sessions }: SessionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session History</CardTitle>
      </CardHeader>
      <CardContent>
        <DataList
          columns={columns}
          data={sessions}
          keyExtractor={(s) => s.id}
          emptyMessage="No sessions recorded yet"
        />
      </CardContent>
    </Card>
  );
}
