"use client";

import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { MessageCircle, Trash2, Loader2, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteNutritionLogAction } from "@/actions/nutrition-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CommentThread } from "./comment-thread";
import { EditMealGroupDialog } from "./edit-meal-group-dialog";
import { formatUtcDate, toDateParam } from "./nutrition-date-utils";

interface Comment {
  id: string;
  body: string;
  logId: string | null;
  createdAt: Date | string;
  author: { id: string; firstName: string; lastName: string; role: "TRAINER" | "CLIENT" };
}

interface NutritionLogItem {
  id: string;
  date: Date | string;
  mealType: string;
  description: string;
  quantity: string | null;
  loggedAt: Date | string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  photoUrl: string | null;
}

interface MealsTableProps {
  clientId: string;
  logs: NutritionLogItem[];
  comments: Comment[];
  canDelete: boolean;
  canEdit: boolean;
  emptyMessage: string;
}

interface DayGroup {
  dateKey: string;
  date: Date;
  logs: NutritionLogItem[];
}

const MEAL_BADGE_STYLE: Record<string, string> = {
  BREAKFAST: "bg-amber-500/10 text-amber-600",
  LUNCH: "bg-emerald-500/10 text-emerald-600",
  DINNER: "bg-indigo-500/10 text-indigo-600",
  SNACK: "bg-fuchsia-500/10 text-fuchsia-600",
};

const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};

function DeleteLogButton({ logId }: { logId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteNutritionLogAction(logId);
      if (!result.success) toast.error(result.error ?? "Failed to delete");
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      aria-label="Delete meal"
      className="rounded-md p-1 text-muted-foreground hover:text-destructive"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Groups logs by their own UTC-anchored `date` field, newest day first, ordered by `loggedAt` within a day. */
function groupByDay(logs: NutritionLogItem[]): DayGroup[] {
  const sorted = [...logs].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime();
  });

  const groups: DayGroup[] = [];
  for (const log of sorted) {
    const date = new Date(log.date);
    const dateKey = toDateParam(date);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.dateKey === dateKey) {
      lastGroup.logs.push(log);
    } else {
      groups.push({ dateKey, date, logs: [log] });
    }
  }
  return groups;
}

export function MealsTable({ clientId, logs, comments, canDelete, canEdit, emptyMessage }: MealsTableProps) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-12 text-center ring-1 ring-dashed ring-border/60">
        <UtensilsCrossed className="h-6 w-6 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const groups = groupByDay(logs);

  return (
    <div className="rounded-xl ring-1 ring-border/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Meal</TableHead>
            <TableHead>Food</TableHead>
            <TableHead className="hidden sm:table-cell">Logged</TableHead>
            <TableHead className="text-right">Cal</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Protein</TableHead>
            <TableHead className="hidden text-right md:table-cell">Carbs</TableHead>
            <TableHead className="hidden text-right md:table-cell">Fat</TableHead>
            <TableHead className="w-16 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.dateKey}>
              {groups.length > 1 && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={8} className="py-1.5 text-xs font-semibold text-muted-foreground">
                    {formatUtcDate(group.date)}
                  </TableCell>
                </TableRow>
              )}
              {group.logs.map((log) => {
                const logComments = comments.filter((c) => c.logId === log.id);
                const isExpanded = expandedLogId === log.id;

                return (
                  <Fragment key={log.id}>
                    <TableRow className={cn(isExpanded && "bg-muted/30")}>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn("font-medium", MEAL_BADGE_STYLE[log.mealType])}
                        >
                          {MEAL_LABELS[log.mealType] ?? log.mealType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {log.photoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={log.photoUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-md object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium leading-tight">{log.description}</p>
                            {log.quantity && (
                              <p className="truncate text-xs text-muted-foreground">{log.quantity}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatUtcDate(group.date)}, {format(new Date(log.loggedAt), "h:mm a")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{log.calories ?? "—"}</TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                        {log.proteinG != null ? `${Math.round(log.proteinG)}g` : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                        {log.carbsG != null ? `${Math.round(log.carbsG)}g` : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                        {log.fatG != null ? `${Math.round(log.fatG)}g` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            aria-label="Toggle feedback"
                            className={cn(
                              "relative rounded-md p-1 hover:bg-muted",
                              logComments.length > 0 ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            {logComments.length > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                                {logComments.length}
                              </span>
                            )}
                          </button>
                          {canEdit && (
                            <EditMealGroupDialog
                              clientId={clientId}
                              date={group.date}
                              mealType={log.mealType}
                              logs={group.logs.filter((l) => l.mealType === log.mealType)}
                            />
                          )}
                          {canDelete && <DeleteLogButton logId={log.id} />}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="py-3">
                          <CommentThread
                            clientId={clientId}
                            date={group.date}
                            logId={log.id}
                            comments={logComments}
                            forceExpanded
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
