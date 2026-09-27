"use client";

import { Button } from "@/components/ui/button";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChevronRight, MessageCircle, Trash2, Loader2, UtensilsCrossed } from "lucide-react";
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

interface MealGroup {
  mealType: string;
  logs: NutritionLogItem[];
}

interface DayGroup {
  dateKey: string;
  date: Date;
  logs: NutritionLogItem[];
  meals: MealGroup[];
}

const MEAL_BADGE_STYLE: Record<string, string> = {
  BREAKFAST: "bg-warning-soft text-warning-foreground",
  LUNCH: "bg-success-soft text-success-foreground",
  DINNER: "bg-info-soft text-info-foreground",
  SNACK: "bg-brand-soft text-brand-foreground",
};

const MEAL_ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

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
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={handleDelete}
      disabled={isPending}
      aria-label="Delete item"
      className="text-muted-foreground hover:text-destructive"
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </Button>
  );
}

function sumField(logs: NutritionLogItem[], field: "calories" | "proteinG" | "carbsG" | "fatG"): number | null {
  const values = logs.map((l) => l[field]).filter((v): v is number => v != null);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
}

function formatGrams(value: number | null): string {
  return value != null ? `${Math.round(value)}g` : "—";
}

/**
 * Splits a day's logs into meals — every row sharing a mealType is one meal
 * (the same grouping EditMealGroupDialog/updateMealGroup edit), so a
 * breakfast logged as six ingredients renders as one meal with six items.
 */
function groupByMeal(logs: NutritionLogItem[]): MealGroup[] {
  const byType = new Map<string, NutritionLogItem[]>();
  for (const log of logs) {
    const items = byType.get(log.mealType);
    if (items) items.push(log);
    else byType.set(log.mealType, [log]);
  }
  const rank = (t: string) => (MEAL_ORDER.includes(t) ? MEAL_ORDER.indexOf(t) : MEAL_ORDER.length);
  return [...byType.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([mealType, items]) => ({ mealType, logs: items }));
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
      groups.push({ dateKey, date, logs: [log], meals: [] });
    }
  }
  for (const group of groups) group.meals = groupByMeal(group.logs);
  return groups;
}

export function MealsTable({ clientId, logs, comments, canDelete, canEdit, emptyMessage }: MealsTableProps) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [openMeals, setOpenMeals] = useState<Set<string>>(new Set());

  function toggleMeal(key: string) {
    setOpenMeals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
              {group.meals.map((meal) => {
                const mealKey = `${group.dateKey}:${meal.mealType}`;
                const isOpen = openMeals.has(mealKey);
                const mealLogIds = new Set(meal.logs.map((l) => l.id));
                const mealCommentCount = comments.filter((c) => c.logId && mealLogIds.has(c.logId)).length;
                const photoUrl = meal.logs.find((l) => l.photoUrl)?.photoUrl;
                const firstLoggedAt = meal.logs[0].loggedAt;
                const itemNames = meal.logs.map((l) => l.description).join(", ");

                return (
                  <Fragment key={mealKey}>
                    <TableRow
                      className={cn("cursor-pointer", isOpen && "bg-muted/30")}
                      onClick={() => toggleMeal(mealKey)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-90"
                            )}
                          />
                          <Badge
                            variant="secondary"
                            className={cn("font-medium", MEAL_BADGE_STYLE[meal.mealType])}
                          >
                            {MEAL_LABELS[meal.mealType] ?? meal.mealType}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {photoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium leading-tight">
                              {meal.logs.length} item{meal.logs.length !== 1 ? "s" : ""}
                            </p>
                            <p className="line-clamp-1 text-xs text-muted-foreground">{itemNames}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatUtcDate(group.date)}, {format(new Date(firstLoggedAt), "h:mm a")}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {sumField(meal.logs, "calories") ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                        {formatGrams(sumField(meal.logs, "proteinG"))}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                        {formatGrams(sumField(meal.logs, "carbsG"))}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                        {formatGrams(sumField(meal.logs, "fatG"))}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {mealCommentCount > 0 && (
                            <span className="flex items-center gap-0.5 px-1 text-xs text-primary">
                              <MessageCircle className="h-3.5 w-3.5" />
                              {mealCommentCount}
                            </span>
                          )}
                          {canEdit && (
                            <EditMealGroupDialog
                              clientId={clientId}
                              date={group.date}
                              mealType={meal.mealType}
                              logs={meal.logs}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen &&
                      meal.logs.map((log) => {
                        const logComments = comments.filter((c) => c.logId === log.id);
                        const isExpanded = expandedLogId === log.id;

                        return (
                          <Fragment key={log.id}>
                            <TableRow className="bg-muted/20 hover:bg-muted/30">
                              <TableCell />
                              <TableCell>
                                <div className="min-w-0 pl-2">
                                  <p className="truncate text-sm leading-tight">{log.description}</p>
                                  {log.quantity && (
                                    <p className="truncate text-xs text-muted-foreground">{log.quantity}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell" />
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {log.calories ?? "—"}
                              </TableCell>
                              <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                                {formatGrams(log.proteinG)}
                              </TableCell>
                              <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                                {formatGrams(log.carbsG)}
                              </TableCell>
                              <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                                {formatGrams(log.fatG)}
                              </TableCell>
                              <TableCell className="text-right">
                                {/* On touch, 28px buttons + a 16px gap keep their 44px hit areas apart. */}
                                <div className="flex items-center justify-end gap-0.5 pointer-coarse:gap-4">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                    aria-label="Toggle feedback"
                                    className={cn(logComments.length > 0 ? "text-primary" : "text-muted-foreground")}
                                  >
                                    <MessageCircle className="size-3.5" />
                                    {logComments.length > 0 && (
                                      <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                                        {logComments.length}
                                      </span>
                                    )}
                                  </Button>
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
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
