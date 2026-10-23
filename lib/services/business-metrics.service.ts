import { prisma } from "@/lib/prisma";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { computeAdherenceStats } from "./session.service";

/**
 * Trainer-facing, organization-scoped business metrics.
 *
 * Every metric here is scoped to a single Clerk organization (`clerkOrgId`) —
 * the same scoping model the exercises/clients surfaces use. An organization can
 * contain multiple trainers and their clients; metrics aggregate across the whole
 * org, not a single trainer, so co-trainers see a consistent picture.
 *
 * Data-source notes (important for interpreting the numbers):
 *  - New Clients / Retention / Average Attendance are backed by live data
 *    (`User`, `WorkoutSessionV2`) that the app writes today.
 *  - Revenue and Programs Sold are backed by the client-billing tables
 *    (`Invoice`, `ClientSubscription`) which model client→trainer payments.
 *    These tables are part of the schema but are NOT yet populated by any
 *    ingestion path (the Stripe webhook currently only syncs `TrainerSubscription`,
 *    i.e. the trainer's own platform plan). Until a client-billing pipeline lands,
 *    these two metrics will correctly read 0 rather than a fabricated value. The
 *    queries target the semantically-correct source, so they light up
 *    automatically once that data exists.
 */

/** Number of trailing months (including the current one) shown in trend charts. */
export const DEFAULT_TREND_MONTHS = 6;

export interface MonthRange {
  start: Date;
  end: Date;
  label: string;
}

export interface TrendPoint {
  month: string;
  value: number;
}

export interface BusinessMetrics {
  /** Revenue collected in the current calendar month, in the org's currency, in cents. */
  revenueThisMonthCents: number;
  /** Clients created in the current calendar month within the org. */
  newClientsThisMonth: number;
  /**
   * Month-over-month client activity retention, 0-100, or null when there were
   * no active clients in the prior month to retain. See {@link getRetentionRate}.
   */
  retentionRate: number | null;
  /** Completed / due session ratio for the current month, 0-100. */
  averageAttendanceRate: number;
  /** Client package subscriptions started in the current calendar month. */
  programsSold: number;
  /** New clients per month over the trend window. */
  newClientsTrend: TrendPoint[];
  /** Average attendance (%) per month over the trend window. */
  attendanceTrend: TrendPoint[];
  /** Whether the viewer belongs to an organization at all. */
  hasOrganization: boolean;
}

/**
 * Builds an ordered list of month ranges ending with the current month.
 * Mirrors the windowing used by the platform-admin analytics service.
 */
export function getMonthRanges(months = DEFAULT_TREND_MONTHS, now = new Date()): MonthRange[] {
  return Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy") };
  });
}

/** Resolves the User ids of every client in the organization. */
async function getOrgClientIds(orgId: string): Promise<string[]> {
  const clients = await prisma.user.findMany({
    where: { clerkOrgId: orgId, role: "CLIENT" },
    select: { id: true },
  });
  return clients.map((c) => c.id);
}

/** Resolves the User ids of every trainer in the organization. */
async function getOrgTrainerIds(orgId: string): Promise<string[]> {
  const trainers = await prisma.user.findMany({
    where: { clerkOrgId: orgId, role: "TRAINER" },
    select: { id: true },
  });
  return trainers.map((t) => t.id);
}

/** Counts clients created within [start, end] for the organization. */
export async function getNewClientsCount(orgId: string, start: Date, end: Date): Promise<number> {
  return prisma.user.count({
    where: { clerkOrgId: orgId, role: "CLIENT", createdAt: { gte: start, lte: end } },
  });
}

/** New-client count per month across the trend window. */
export async function getNewClientsTrend(orgId: string, months = DEFAULT_TREND_MONTHS, now = new Date()): Promise<TrendPoint[]> {
  const ranges = getMonthRanges(months, now);
  const counts = await Promise.all(
    ranges.map((r) => getNewClientsCount(orgId, r.start, r.end))
  );
  return ranges.map((r, i) => ({ month: r.label, value: counts[i] }));
}

/**
 * Client revenue (in cents) for the given trainers within [start, end], from
 * trainer payments (Stripe Connect):
 * - one-time program sales: OfferPurchase rows PAID within the window
 *   (refunded sales drop out because their status leaves PAID);
 * - coaching memberships: one monthly charge for every membership that was
 *   activated (ever paid) by the window's end and was still billing during
 *   it (ACTIVE, or CANCELED within it), at the
 *   offer's current price. MIA stores no per-invoice rows, so this is an
 *   estimate — exact for monthly windows unless a price changed mid-way.
 */
export async function getRevenueCents(trainerIds: string[], start: Date, end: Date): Promise<number> {
  if (trainerIds.length === 0) return 0;
  const [sales, memberships] = await Promise.all([
    prisma.offerPurchase.aggregate({
      _sum: { amountInCents: true },
      where: {
        trainerId: { in: trainerIds },
        status: "PAID",
        paidAt: { gte: start, lte: end },
      },
    }),
    prisma.offerSubscription.findMany({
      where: {
        trainerId: { in: trainerIds },
        // Checkouts that never paid (incomplete → incomplete_expired) have no activatedAt.
        activatedAt: { lte: end },
        OR: [{ status: "ACTIVE" }, { status: "CANCELED", canceledAt: { gte: start } }],
      },
      select: { offer: { select: { priceInCents: true } } },
    }),
  ]);
  const membershipCents = memberships.reduce((sum, m) => sum + m.offer.priceInCents, 0);
  return (sales._sum.amountInCents ?? 0) + membershipCents;
}

/** Programs sold (paid, not refunded) within [start, end] by the org's trainers. */
export async function getProgramsSold(trainerIds: string[], start: Date, end: Date): Promise<number> {
  if (trainerIds.length === 0) return 0;
  return prisma.offerPurchase.count({
    where: { trainerId: { in: trainerIds }, status: "PAID", paidAt: { gte: start, lte: end } },
  });
}

/** Distinct client ids (from the provided set) with a completed session in [start, end]. */
async function getActiveClientIds(clientIds: string[], start: Date, end: Date): Promise<Set<string>> {
  if (clientIds.length === 0) return new Set();
  const sessions = await prisma.workoutSessionV2.findMany({
    where: {
      clientId: { in: clientIds },
      status: "COMPLETED",
      completedAt: { gte: start, lte: end },
    },
    distinct: ["clientId"],
    select: { clientId: true },
  });
  return new Set(sessions.map((s) => s.clientId));
}

/**
 * Month-over-month activity retention.
 *
 * Formula: of the clients who were "active" last calendar month, what percentage
 * were also active this calendar month, where "active" means completing at least
 * one workout session in that month.
 *
 *   retention = |activeLastMonth ∩ activeThisMonth| / |activeLastMonth| * 100
 *
 * Returns null when no clients were active last month (division is undefined —
 * there is nothing to retain), so callers can render "—" rather than a
 * misleading 0%.
 */
export async function getRetentionRate(clientIds: string[], now = new Date()): Promise<number | null> {
  const currentStart = startOfMonth(now);
  const currentEnd = endOfMonth(now);
  const prevMonth = subMonths(now, 1);
  const prevStart = startOfMonth(prevMonth);
  const prevEnd = endOfMonth(prevMonth);

  const [activePrev, activeCurrent] = await Promise.all([
    getActiveClientIds(clientIds, prevStart, prevEnd),
    getActiveClientIds(clientIds, currentStart, currentEnd),
  ]);

  if (activePrev.size === 0) return null;
  let retained = 0;
  for (const id of activePrev) {
    if (activeCurrent.has(id)) retained += 1;
  }
  return Math.round((retained / activePrev.size) * 100);
}

/**
 * Average attendance for [start, dueCutoff]: completed sessions as a share of all
 * sessions that were due (scheduled on or before the cutoff). Reuses the shared
 * {@link computeAdherenceStats} completion-rate logic so attendance stays
 * consistent with the per-client adherence surfaces.
 */
export async function getAverageAttendance(clientIds: string[], start: Date, end: Date, now = new Date()): Promise<number> {
  if (clientIds.length === 0) return 0;
  // Only sessions already due can count against attendance — a future scheduled
  // session is neither attended nor missed yet.
  const dueCutoff = end < now ? end : now;
  if (dueCutoff < start) return 0;

  const sessions = await prisma.workoutSessionV2.findMany({
    where: {
      clientId: { in: clientIds },
      scheduledDate: { gte: start, lte: dueCutoff },
    },
    select: { status: true, overallRPE: true },
  });
  return computeAdherenceStats(sessions).completionRate;
}

/** Average attendance (%) per month across the trend window. */
export async function getAttendanceTrend(clientIds: string[], months = DEFAULT_TREND_MONTHS, now = new Date()): Promise<TrendPoint[]> {
  const ranges = getMonthRanges(months, now);
  const rates = await Promise.all(
    ranges.map((r) => getAverageAttendance(clientIds, r.start, r.end, now))
  );
  return ranges.map((r, i) => ({ month: r.label, value: rates[i] }));
}

/**
 * Aggregates every trainer-facing business metric for an organization.
 *
 * @param params.orgId  The viewer's Clerk organization id (resolved by the caller
 *                       from the live session, falling back to the DB record).
 * @param params.months Trend-window length; defaults to {@link DEFAULT_TREND_MONTHS}.
 */
export async function getBusinessMetrics(params: {
  orgId: string | undefined;
  months?: number;
  now?: Date;
}): Promise<BusinessMetrics> {
  const { orgId, months = DEFAULT_TREND_MONTHS, now = new Date() } = params;

  if (!orgId) {
    return {
      revenueThisMonthCents: 0,
      newClientsThisMonth: 0,
      retentionRate: null,
      averageAttendanceRate: 0,
      programsSold: 0,
      newClientsTrend: getMonthRanges(months, now).map((r) => ({ month: r.label, value: 0 })),
      attendanceTrend: getMonthRanges(months, now).map((r) => ({ month: r.label, value: 0 })),
      hasOrganization: false,
    };
  }

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [clientIds, trainerIds] = await Promise.all([
    getOrgClientIds(orgId),
    getOrgTrainerIds(orgId),
  ]);

  const [
    revenueThisMonthCents,
    newClientsThisMonth,
    retentionRate,
    averageAttendanceRate,
    programsSold,
    newClientsTrend,
    attendanceTrend,
  ] = await Promise.all([
    getRevenueCents(trainerIds, monthStart, monthEnd),
    getNewClientsCount(orgId, monthStart, monthEnd),
    getRetentionRate(clientIds, now),
    getAverageAttendance(clientIds, monthStart, monthEnd, now),
    getProgramsSold(trainerIds, monthStart, monthEnd),
    getNewClientsTrend(orgId, months, now),
    getAttendanceTrend(clientIds, months, now),
  ]);

  return {
    revenueThisMonthCents,
    newClientsThisMonth,
    retentionRate,
    averageAttendanceRate,
    programsSold,
    newClientsTrend,
    attendanceTrend,
    hasOrganization: true,
  };
}
