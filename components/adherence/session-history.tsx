import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/dates";

interface SessionHistoryProps {
  sessions: Array<{
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
  }>;
}

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  abandoned: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function SessionHistory({ sessions }: SessionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Exercises</TableHead>
                <TableHead className="hidden sm:table-cell">Pain</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                    No sessions recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      {formatDateTime(s.startedAt)}
                    </TableCell>
                    <TableCell className="text-sm">{s.planTitle}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[s.status] ?? ""}`}>
                        {s.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {s.exercisesCompleted}/{s.exercisesTotal}
                      {s.exercisesSkipped > 0 && (
                        <span className="text-muted-foreground"> ({s.exercisesSkipped} skipped)</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {s.overallPainLevel !== null ? `${s.overallPainLevel}/10` : "-"}
                    </TableCell>
                    <TableCell className="hidden max-w-[200px] truncate text-sm text-muted-foreground md:table-cell">
                      {s.notes ?? "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
