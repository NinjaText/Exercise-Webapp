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
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatAssessmentType } from "@/lib/utils/formatting";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { Assessment } from "@prisma/client";

interface AssessmentHistoryProps {
  assessments: Assessment[];
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Trend</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => {
                        const prevItem = items[index + 1];
                        const currentVal = Number(item.value);
                        const prevVal = prevItem ? Number(prevItem.value) : null;

                        let trend: "up" | "down" | "same" = "same";
                        if (prevVal !== null) {
                          if (currentVal > prevVal) trend = "up";
                          else if (currentVal < prevVal) trend = "down";
                        }

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">
                              {formatDate(item.createdAt)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {item.value} {item.unit}
                            </TableCell>
                            <TableCell>
                              {prevVal !== null && (
                                <span className="flex items-center gap-1">
                                  {trend === "up" && (
                                    <ArrowUp className="h-3.5 w-3.5 text-success" />
                                  )}
                                  {trend === "down" && (
                                    <ArrowDown className="h-3.5 w-3.5 text-danger" />
                                  )}
                                  {trend === "same" && (
                                    <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {item.notes ?? "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
