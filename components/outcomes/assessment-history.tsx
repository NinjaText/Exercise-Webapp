import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList, type Column } from "@/components/shared/data-list";
import { formatDate } from "@/lib/utils/dates";
import { formatAssessmentType } from "@/lib/utils/formatting";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { Assessment } from "@prisma/client";

interface AssessmentHistoryProps {
  assessments: Assessment[];
}

/** An assessment plus its direction vs. the previous (older) reading of the same type. */
type AssessmentRow = Assessment & { trend: "up" | "down" | "same" | null };

const columns: Column<AssessmentRow>[] = [
  { key: "date", header: "Date", render: (item) => formatDate(item.createdAt) },
  {
    key: "value",
    header: "Value",
    className: "font-medium",
    render: (item) => `${item.value} ${item.unit}`,
  },
  {
    key: "trend",
    header: "Trend",
    render: (item) =>
      item.trend === null ? (
        "—"
      ) : (
        <span className="flex items-center gap-1">
          {item.trend === "up" && <ArrowUp className="h-3.5 w-3.5 text-success" />}
          {item.trend === "down" && <ArrowDown className="h-3.5 w-3.5 text-danger" />}
          {item.trend === "same" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
      ),
  },
  {
    key: "notes",
    header: "Notes",
    className: "max-w-[200px] text-muted-foreground sm:truncate max-sm:col-span-2 max-sm:max-w-none",
    render: (item) => item.notes ?? "-",
  },
];

function withTrends(items: Assessment[]): AssessmentRow[] {
  return items.map((item, index) => {
    const prevItem = items[index + 1];
    if (!prevItem) return { ...item, trend: null };
    const currentVal = Number(item.value);
    const prevVal = Number(prevItem.value);
    const trend = currentVal > prevVal ? "up" : currentVal < prevVal ? "down" : "same";
    return { ...item, trend };
  });
}

export function AssessmentHistory({ assessments }: AssessmentHistoryProps) {
  // Group by type
  const grouped = assessments.reduce<Record<string, Assessment[]>>((acc, a) => {
    if (!acc[a.assessmentType]) acc[a.assessmentType] = [];
    acc[a.assessmentType].push(a);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assessment History</CardTitle>
      </CardHeader>
      <CardContent>
        {Object.entries(grouped).length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No assessments recorded yet
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <h4 className="font-medium mb-2">{formatAssessmentType(type)}</h4>
                <DataList columns={columns} data={withTrends(items)} keyExtractor={(item) => item.id} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
