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

// ─── Meal Logs ───────────────────────────────────────────────────────────────

export async function getNutritionLogsForDate(clientId: string, date: Date) {
  const { start, end } = dayRange(date);
  return prisma.nutritionLog.findMany({
    where: { clientId, date: { gte: start, lt: end } },
    include: { comments: true },
    orderBy: { loggedAt: "asc" },
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
