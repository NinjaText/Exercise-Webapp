import { prisma } from "@/lib/prisma";
import type { NutritionTarget } from "@prisma/client";
import { NUTRITION_TARGET_FIELDS, type NutritionTargetField } from "@/lib/validators/nutrition";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the [start, end) UTC day boundaries containing `d`. */
function dayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Parses a `?date=YYYY-MM-DD` search param into a Date for the meals-history
 * view. Falls back to today for a missing or invalid value, and clamps any
 * future date to today — the meals table never navigates ahead of the
 * present day.
 */
export function parseNutritionDateParam(raw: string | undefined): Date {
  if (!raw) return new Date();

  // Anchor to UTC midnight — every read query in this module (via `dayRange`)
  // computes day boundaries from UTC year/month/date, so parsing in the
  // server's local timezone here would silently shift the selected day
  // whenever the process runs ahead of UTC.
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return new Date();

  const now = new Date();
  const todayUTCMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() > todayUTCMidnight) return new Date(todayUTCMidnight);

  return parsed;
}

// ─── Targets ─────────────────────────────────────────────────────────────────

/**
 * Returns the client's NutritionTarget, creating an empty one (all fields
 * unset) on first access so the rest of the module always has a row to work
 * with.
 */
export async function getOrCreateNutritionTarget(clientId: string): Promise<NutritionTarget> {
  const existing = await prisma.nutritionTarget.findUnique({ where: { clientId } });
  if (existing) return existing;

  return prisma.nutritionTarget.create({ data: { clientId } });
}

/**
 * Updates a client's nutrition target. Trainers may update any field,
 * including which fields are client-editable. Clients may only update
 * fields listed in the target's own `clientEditableFields`.
 *
 * Throws if a CLIENT actor attempts to edit a field they aren't permitted to.
 */
export async function updateNutritionTarget(
  clientId: string,
  actorRole: "TRAINER" | "CLIENT",
  updates: Partial<Record<NutritionTargetField, number | null>> & {
    clientEditableFields?: NutritionTargetField[];
  }
): Promise<NutritionTarget> {
  const target = await getOrCreateNutritionTarget(clientId);

  if (actorRole === "CLIENT") {
    if (updates.clientEditableFields) {
      throw new Error("Only a trainer can change which fields a client may edit");
    }
    const attempted = NUTRITION_TARGET_FIELDS.filter((f) => f in updates);
    const forbidden = attempted.filter((f) => !target.clientEditableFields.includes(f));
    if (forbidden.length > 0) {
      throw new Error(`You are not permitted to edit: ${forbidden.join(", ")}`);
    }
  }

  return prisma.nutritionTarget.update({
    where: { clientId },
    data: updates,
  });
}

// ─── Date Ranges ─────────────────────────────────────────────────────────────

export type NutritionRangePreset = "TODAY" | "THIS_WEEK" | "LAST_WEEK" | "THIS_MONTH" | "LAST_MONTH" | "CUSTOM";

const RANGE_PRESETS: NutritionRangePreset[] = [
  "TODAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "CUSTOM",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves a preset (or explicit custom bounds) into UTC-midnight-anchored
 * `[start, end]` day boundaries, both inclusive. Weeks run Monday–Sunday.
 * Every range clamps `end` to today — this view never looks into the future.
 */
export function resolveNutritionRange(
  preset: NutritionRangePreset,
  today: Date = new Date(),
  customStart?: Date,
  customEnd?: Date
): { start: Date; end: Date } {
  const { start: todayStart } = dayRange(today);

  switch (preset) {
    case "THIS_WEEK": {
      const daysSinceMonday = (todayStart.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
      const monday = new Date(todayStart.getTime() - daysSinceMonday * DAY_MS);
      return { start: monday, end: todayStart };
    }

    case "LAST_WEEK": {
      const daysSinceMonday = (todayStart.getUTCDay() + 6) % 7;
      const thisMonday = new Date(todayStart.getTime() - daysSinceMonday * DAY_MS);
      const lastMonday = new Date(thisMonday.getTime() - 7 * DAY_MS);
      const lastSunday = new Date(thisMonday.getTime() - DAY_MS);
      return { start: lastMonday, end: lastSunday };
    }

    case "THIS_MONTH": {
      const start = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1));
      return { start, end: todayStart };
    }

    case "LAST_MONTH": {
      const start = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 0));
      return { start, end };
    }

    case "CUSTOM": {
      if (!customStart || !customEnd) return { start: todayStart, end: todayStart };
      const { start: startDay } = dayRange(customStart);
      let { start: endDay } = dayRange(customEnd);
      if (endDay.getTime() > todayStart.getTime()) endDay = todayStart;
      if (startDay.getTime() > endDay.getTime()) return { start: endDay, end: endDay };
      return { start: startDay, end: endDay };
    }

    case "TODAY":
    default:
      return { start: todayStart, end: todayStart };
  }
}

export interface ResolvedNutritionRange {
  preset: NutritionRangePreset;
  start: Date;
  end: Date;
}

function parseDateOnlyParam(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Parses `?range=&start=&end=` search params into a resolved meals-history
 * range. `start`/`end` (as `YYYY-MM-DD`) are only consulted when
 * `range=custom`; an unrecognized or missing preset falls back to `TODAY`.
 */
export function parseNutritionRangeParams(params: {
  range?: string;
  start?: string;
  end?: string;
}): ResolvedNutritionRange {
  const upper = params.range?.toUpperCase();
  const preset = RANGE_PRESETS.includes(upper as NutritionRangePreset)
    ? (upper as NutritionRangePreset)
    : "TODAY";

  const today = new Date();

  if (preset === "CUSTOM") {
    const customStart = parseDateOnlyParam(params.start);
    const customEnd = parseDateOnlyParam(params.end);
    const { start, end } = resolveNutritionRange("CUSTOM", today, customStart, customEnd);
    return { preset, start, end };
  }

  const { start, end } = resolveNutritionRange(preset, today);
  return { preset, start, end };
}

// ─── Meal Logs ───────────────────────────────────────────────────────────────

export async function getNutritionLogsForDate(clientId: string, date: Date) {
  const { start, end } = dayRange(date);
  return prisma.nutritionLog.findMany({
    where: { clientId, date: { gte: start, lt: end } },
    include: { comments: true },
    orderBy: { loggedAt: "asc" },
  });
}

/**
 * Returns every NutritionLog between `start` and `end` (both UTC-anchored,
 * inclusive), newest day first — the data backing a multi-day meals-history
 * view. Pass the same day for `start`/`end` to fetch a single day.
 */
export async function getNutritionLogsForRange(clientId: string, start: Date, end: Date) {
  const { end: exclusiveEnd } = dayRange(end);
  return prisma.nutritionLog.findMany({
    where: { clientId, date: { gte: start, lt: exclusiveEnd } },
    include: { comments: true },
    orderBy: [{ date: "desc" }, { loggedAt: "asc" }],
  });
}

export async function createNutritionLog(data: {
  clientId: string;
  date: Date;
  mealType: string;
  description: string;
  quantity?: string;
  loggedAt?: Date;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  photoUrl?: string | null;
}) {
  return prisma.nutritionLog.create({
    data: {
      clientId: data.clientId,
      date: dayRange(data.date).start,
      mealType: data.mealType,
      description: data.description,
      quantity: data.quantity,
      loggedAt: data.loggedAt ?? new Date(),
      calories: data.calories,
      proteinG: data.proteinG,
      carbsG: data.carbsG,
      fatG: data.fatG,
      photoUrl: data.photoUrl,
    },
  });
}

export async function updateNutritionLog(
  logId: string,
  data: Partial<{
    mealType: string;
    description: string;
    quantity: string | null;
    loggedAt: Date;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    photoUrl: string | null;
  }>
) {
  return prisma.nutritionLog.update({ where: { id: logId }, data });
}

export async function deleteNutritionLog(logId: string) {
  return prisma.nutritionLog.delete({ where: { id: logId } });
}

export interface MealGroupItemInput {
  id?: string;
  description: string;
  quantity?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  photoUrl?: string | null;
}

/**
 * Replaces the set of NutritionLog rows for a (clientId, date, mealType)
 * group with `items`, diffing against what's currently stored: items with an
 * `id` are updated, items without one are created, and existing rows not
 * present in `items` are deleted. Throws if `items` is empty rather than
 * silently deleting the whole meal — callers should delete individual logs
 * instead if that's the intent.
 */
export async function updateMealGroup(
  clientId: string,
  date: Date,
  mealType: string,
  items: MealGroupItemInput[]
): Promise<{ ids: string[] }> {
  if (items.length === 0) {
    throw new Error("A meal must have at least one item — delete it instead if you want to remove it entirely");
  }

  const { start, end } = dayRange(date);
  const existing = await prisma.nutritionLog.findMany({
    where: { clientId, date: { gte: start, lt: end }, mealType },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((l) => l.id));
  const submittedIds = new Set(items.filter((i) => i.id).map((i) => i.id as string));
  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));

  const invalidIds = items.filter((i) => i.id && !existingIds.has(i.id)).map((i) => i.id);
  if (invalidIds.length > 0) {
    throw new Error("One or more items don't belong to this meal group");
  }

  // New items added to a meal group on a non-today calendar day have no
  // natural "time of day" — stamp them at the start of that UTC day (rather
  // than defaulting to the real current instant) so they sort predictably
  // alongside that day's other items instead of appearing far in the future
  // relative to the historical day being edited. Today's meals keep using
  // the real logging time, which is still meaningful.
  const isCurrentUTCDay = start.getTime() === dayRange(new Date()).start.getTime();

  const existingItems = items.filter(
    (i): i is MealGroupItemInput & { id: string } => Boolean(i.id)
  );
  const newItems = items.filter((i) => !i.id);

  // Built as an array of un-awaited Prisma operations (not the
  // updateNutritionLog/createNutritionLog service helpers, which are async
  // functions and would lose the special PrismaPromise typing those helpers'
  // `return` statements erase) so the whole diff — updates, creates, and the
  // delete of removed rows — commits atomically via the array-form
  // `$transaction`. If any operation fails, none of them apply, avoiding a
  // partially-mutated meal group.
  const updateOps = existingItems.map((i) =>
    prisma.nutritionLog.update({
      where: { id: i.id },
      data: {
        description: i.description,
        quantity: i.quantity ?? null,
        calories: i.calories ?? null,
        proteinG: i.proteinG ?? null,
        carbsG: i.carbsG ?? null,
        fatG: i.fatG ?? null,
      },
    })
  );

  const createOps = newItems.map((i) =>
    prisma.nutritionLog.create({
      data: {
        clientId,
        date: start,
        mealType,
        description: i.description,
        quantity: i.quantity ?? undefined,
        loggedAt: isCurrentUTCDay ? new Date() : start,
        calories: i.calories,
        proteinG: i.proteinG,
        carbsG: i.carbsG,
        fatG: i.fatG,
        photoUrl: i.photoUrl,
      },
    })
  );

  const deleteOps =
    toDelete.length > 0 ? [prisma.nutritionLog.deleteMany({ where: { id: { in: toDelete } } })] : [];

  const results = await prisma.$transaction([...updateOps, ...createOps, ...deleteOps]);

  const updated = results.slice(0, updateOps.length) as { id: string }[];
  const created = results.slice(updateOps.length, updateOps.length + createOps.length) as {
    id: string;
  }[];

  return { ids: [...updated.map((l) => l.id), ...created.map((l) => l.id)] };
}

// ─── Water ───────────────────────────────────────────────────────────────────

export async function addWaterLog(clientId: string, date: Date, amountMl: number) {
  return prisma.nutritionWaterLog.create({
    data: { clientId, date: dayRange(date).start, amountMl },
  });
}

export async function getWaterTotalForDate(clientId: string, date: Date): Promise<number> {
  const { start, end } = dayRange(date);
  const result = await prisma.nutritionWaterLog.aggregate({
    where: { clientId, date: { gte: start, lt: end } },
    _sum: { amountMl: true },
  });
  return result._sum.amountMl ?? 0;
}

// ─── Daily Summary & Adherence ───────────────────────────────────────────────

export interface DailySummary {
  target: NutritionTarget;
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number; waterMl: number };
  remaining: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    waterMl: number | null;
  };
  adherencePct: number | null;
  mealsLogged: number;
}

/**
 * Averages per-field hit-rates (consumed/target, capped at 100%) across every
 * target field that has a goal set. Returns null if no goals are set at all.
 */
export function computeAdherence(
  target: Pick<NutritionTarget, "calories" | "proteinG" | "carbsG" | "fatG" | "waterMl">,
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number; waterMl: number }
): number | null {
  const pairs: [number | null | undefined, number][] = [
    [target.calories, consumed.calories],
    [target.proteinG, consumed.proteinG],
    [target.carbsG, consumed.carbsG],
    [target.fatG, consumed.fatG],
    [target.waterMl, consumed.waterMl],
  ];

  const rates = pairs
    .filter((pair): pair is [number, number] => typeof pair[0] === "number" && pair[0] > 0)
    .map(([goal, actual]) => Math.min(actual / goal, 1) * 100);

  if (rates.length === 0) return null;
  return Math.round(rates.reduce((sum, r) => sum + r, 0) / rates.length);
}

export async function getDailySummary(clientId: string, date: Date): Promise<DailySummary> {
  const [target, logs, waterMl] = await Promise.all([
    getOrCreateNutritionTarget(clientId),
    getNutritionLogsForDate(clientId, date),
    getWaterTotalForDate(clientId, date),
  ]);

  const consumed = logs.reduce(
    (acc, log) => {
      acc.calories += log.calories ?? 0;
      acc.proteinG += log.proteinG ?? 0;
      acc.carbsG += log.carbsG ?? 0;
      acc.fatG += log.fatG ?? 0;
      return acc;
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl }
  );

  const remaining = {
    calories: target.calories != null ? target.calories - consumed.calories : null,
    proteinG: target.proteinG != null ? target.proteinG - consumed.proteinG : null,
    carbsG: target.carbsG != null ? target.carbsG - consumed.carbsG : null,
    fatG: target.fatG != null ? target.fatG - consumed.fatG : null,
    waterMl: target.waterMl != null ? target.waterMl - consumed.waterMl : null,
  };

  return {
    target,
    consumed,
    remaining,
    adherencePct: computeAdherence(target, consumed),
    mealsLogged: logs.length,
  };
}

// ─── History, Trends & Streaks ───────────────────────────────────────────────

export interface DailyHistoryPoint {
  date: Date;
  consumed: DailySummary["consumed"];
  target: NutritionTarget;
  adherencePct: number | null;
  mealsLogged: number;
}

/**
 * Returns one DailySummary per day for the `days`-day window ending today
 * (inclusive), oldest first — the series backing trend charts and averages.
 */
export async function getNutritionHistory(
  clientId: string,
  days: number,
  endDate: Date = new Date()
): Promise<DailyHistoryPoint[]> {
  const { start: todayStart } = dayRange(endDate);

  const points = await Promise.all(
    Array.from({ length: days }, (_, i) => {
      const day = new Date(todayStart.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      return getDailySummary(clientId, day).then((summary) => ({
        date: day,
        consumed: summary.consumed,
        target: summary.target,
        adherencePct: summary.adherencePct,
        mealsLogged: summary.mealsLogged,
      }));
    })
  );

  return points;
}

/** Average adherence across history points that have at least one logged meal. */
export function averageAdherence(history: DailyHistoryPoint[]): number | null {
  const withAdherence = history.filter((p) => p.adherencePct !== null);
  if (withAdherence.length === 0) return null;
  return Math.round(
    withAdherence.reduce((sum, p) => sum + (p.adherencePct ?? 0), 0) / withAdherence.length
  );
}

/** Share of days (with a water target set) where the water goal was met, as a %. */
export function averageWaterAdherence(history: DailyHistoryPoint[]): number | null {
  const withTarget = history.filter((p) => p.target.waterMl && p.target.waterMl > 0);
  if (withTarget.length === 0) return null;
  const hitRates = withTarget.map((p) =>
    Math.min(p.consumed.waterMl / (p.target.waterMl as number), 1)
  );
  return Math.round((hitRates.reduce((sum, r) => sum + r, 0) / hitRates.length) * 100);
}

/** Consecutive days (ending on the most recent day in `history`) with at least one meal logged. */
export function computeLoggingStreak(history: DailyHistoryPoint[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].mealsLogged === 0) break;
    streak++;
  }
  return streak;
}

// ─── Trainer Roster Snapshot ─────────────────────────────────────────────────

export interface ClientAdherenceSnapshot {
  clientId: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  adherencePct: number | null;
  mealsLogged: number;
  consumed: DailySummary["consumed"];
  target: NutritionTarget;
  avgAdherence7d: number | null;
  avgWaterAdherence7d: number | null;
}

/**
 * Returns today's adherence snapshot for every client in the trainer's org —
 * the data backing the trainer's nutrition roster view. Also includes each
 * client's trailing 7-day average adherence and water adherence for the
 * Coach Dashboard's history requirement.
 */
export async function getRosterAdherenceSnapshot(
  trainerId: string,
  date: Date = new Date()
): Promise<ClientAdherenceSnapshot[]> {
  const trainer = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { clerkOrgId: true },
  });
  if (!trainer?.clerkOrgId) return [];

  const clients = await prisma.user.findMany({
    where: { clerkOrgId: trainer.clerkOrgId, role: "CLIENT" },
    select: { id: true, firstName: true, lastName: true, imageUrl: true },
    orderBy: { firstName: "asc" },
  });

  const snapshots = await Promise.all(
    clients.map(async (client) => {
      const [summary, history] = await Promise.all([
        getDailySummary(client.id, date),
        getNutritionHistory(client.id, 7, date),
      ]);
      return {
        clientId: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        imageUrl: client.imageUrl,
        adherencePct: summary.adherencePct,
        mealsLogged: summary.mealsLogged,
        consumed: summary.consumed,
        target: summary.target,
        avgAdherence7d: averageAdherence(history),
        avgWaterAdherence7d: averageWaterAdherence(history),
      };
    })
  );

  return snapshots;
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function getNutritionCommentsForDate(clientId: string, date: Date) {
  const { start, end } = dayRange(date);
  return prisma.nutritionComment.findMany({
    where: { clientId, date: { gte: start, lt: end } },
    include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Same as {@link getNutritionCommentsForDate}, but across a `[start, end]` UTC-anchored range. */
export async function getNutritionCommentsForRange(clientId: string, start: Date, end: Date) {
  const { end: exclusiveEnd } = dayRange(end);
  return prisma.nutritionComment.findMany({
    where: { clientId, date: { gte: start, lt: exclusiveEnd } },
    include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createNutritionComment(data: {
  clientId: string;
  authorId: string;
  date: Date;
  logId?: string;
  body: string;
}) {
  return prisma.nutritionComment.create({
    data: {
      clientId: data.clientId,
      authorId: data.authorId,
      date: dayRange(data.date).start,
      logId: data.logId,
      body: data.body,
    },
    include: { author: { select: { id: true, firstName: true, lastName: true, role: true } } },
  });
}
