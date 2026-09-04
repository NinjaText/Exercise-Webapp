import { prisma } from "@/lib/prisma";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { startOfDay, endOfDay } from "date-fns";

export type AlertSeverity = "high" | "medium" | "low";

export type AlertKind =
  | "pain_feedback"
  | "no_sessions_started"
  | "inactive"
  | "discomfort"
  | "low_completion"
  | "delayed_pattern"
  | "program_ending"
  | "fully_completed";

export interface PriorityAlert {
  clientId: string;
  clientName: string;
  severity: AlertSeverity;
  kind: AlertKind;
  message: string;
  href: string;
}

export interface ClientSessionSummary {
  status: string;
  scheduledDate: Date;
  completedAt: Date | null;
  startedAt: Date | null;
  scheduleVariance: string | null;
}

export interface VarianceBreakdown {
  onTime: number;
  early: number;
  delayed: number;
  missed: number;
}

export interface ClientActiveProgram {
  name: string;
  startDate: Date | null;
  durationWeeks: number | null;
}

export interface ClientSnapshot {
  clientId: string;
  clientName: string;
  sessions: ClientSessionSummary[];
  activeProgram: ClientActiveProgram | null;
  recentFeedback: { rating: string; createdAt: Date }[];
}

export interface ClientMetrics {
  programWeek: { current: number; total: number } | null;
  streak: number;
  lastCompletedAt: Date | null;
}

export interface ClientProgressBreakdown {
  onTrack: number;
  atRisk: number;
  offTrack: number;
  total: number;
}

export interface DashboardInsights {
  priorities: PriorityAlert[];
  clientsNeedingAttention: number;
  sessionsDueToday: number;
  clientMetrics: Record<string, ClientMetrics>;
  clientProgress: ClientProgressBreakdown;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const INACTIVITY_THRESHOLD_DAYS = 5;
const COMPLETION_WINDOW_DAYS = 14;
const LOW_COMPLETION_THRESHOLD = 0.5;
const MIN_SESSIONS_FOR_RATE = 2;
const PROGRAM_ENDING_SOON_DAYS = 7;
const FEEDBACK_LOOKBACK_DAYS = 7;
const HISTORY_WINDOW_DAYS = 45;
const MAX_PRIORITY_ALERTS = 8;
const MIN_DELAYED_FOR_PATTERN = 2;

const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };

export function getLastActivityAt(sessions: ClientSessionSummary[]): Date | null {
  let latest: Date | null = null;
  for (const s of sessions) {
    const ts = s.completedAt ?? s.startedAt;
    if (ts && (!latest || ts > latest)) latest = ts;
  }
  return latest;
}

export function getLastCompletedAt(sessions: ClientSessionSummary[]): Date | null {
  let latest: Date | null = null;
  for (const s of sessions) {
    if (s.status === "COMPLETED" && s.completedAt && (!latest || s.completedAt > latest)) {
      latest = s.completedAt;
    }
  }
  return latest;
}

export function computeProgramWeek(
  program: ClientActiveProgram | null,
  now: Date
): { current: number; total: number } | null {
  if (!program?.startDate || !program.durationWeeks || program.durationWeeks <= 0) return null;
  const elapsedMs = now.getTime() - program.startDate.getTime();
  const total = program.durationWeeks;
  if (elapsedMs < 0) return { current: 1, total };
  const weeksElapsed = Math.floor(elapsedMs / (DAY_MS * 7));
  return { current: Math.min(weeksElapsed + 1, total), total };
}

export function computeSessionStreak(sessions: ClientSessionSummary[], now: Date): number {
  const past = sessions
    .filter((s) => s.scheduledDate <= now)
    .sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime());
  let streak = 0;
  for (const s of past) {
    if (s.status === "COMPLETED") streak += 1;
    else break;
  }
  return streak;
}

export function computeCompletionRate(
  sessions: ClientSessionSummary[],
  now: Date,
  windowDays = COMPLETION_WINDOW_DAYS
): { rate: number; scheduled: number } {
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const inWindow = sessions.filter(
    (s) => s.scheduledDate >= windowStart && s.scheduledDate <= now
  );
  if (inWindow.length === 0) return { rate: 0, scheduled: 0 };
  const completed = inWindow.filter((s) => s.status === "COMPLETED").length;
  return { rate: completed / inWindow.length, scheduled: inWindow.length };
}

/**
 * Breaks down completed/missed sessions in the trailing window by how they
 * relate to their scheduled date. Early completions and intentional
 * reschedules are not adherence problems — only delayed and missed sessions
 * indicate a client is falling behind their plan.
 */
export function computeVarianceBreakdown(
  sessions: ClientSessionSummary[],
  now: Date,
  windowDays = COMPLETION_WINDOW_DAYS
): VarianceBreakdown {
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const inWindow = sessions.filter(
    (s) => s.scheduledDate >= windowStart && s.scheduledDate <= now
  );
  const breakdown: VarianceBreakdown = { onTime: 0, early: 0, delayed: 0, missed: 0 };
  for (const s of inWindow) {
    if (s.status === "MISSED") {
      breakdown.missed += 1;
    } else if (s.status === "COMPLETED") {
      if (s.scheduleVariance === "EARLY") breakdown.early += 1;
      else if (s.scheduleVariance === "DELAYED") breakdown.delayed += 1;
      else breakdown.onTime += 1; // ON_TIME, or legacy/unbackfilled sessions
    }
  }
  return breakdown;
}

export function countSessionsDueToday(snapshots: ClientSnapshot[], now: Date): number {
  const start = startOfDay(now).getTime();
  const end = endOfDay(now).getTime();
  let count = 0;
  for (const snap of snapshots) {
    for (const s of snap.sessions) {
      const t = s.scheduledDate.getTime();
      if (t >= start && t <= end && (s.status === "SCHEDULED" || s.status === "IN_PROGRESS")) {
        count += 1;
      }
    }
  }
  return count;
}

export function buildPriorityAlerts(snapshots: ClientSnapshot[], now: Date): PriorityAlert[] {
  const alerts: PriorityAlert[] = [];

  for (const snap of snapshots) {
    const { clientId, clientName } = snap;
    const href = `/clients/${clientId}`;

    const painFeedback = snap.recentFeedback.find((f) => f.rating === "PAINFUL");
    if (painFeedback) {
      alerts.push({
        clientId,
        clientName,
        severity: "high",
        kind: "pain_feedback",
        message: `${clientName} reported pain on a recent exercise`,
        href,
      });
    }

    if (snap.activeProgram) {
      const programHasStarted = !snap.activeProgram.startDate || snap.activeProgram.startDate <= now;
      const lastActivity = getLastActivityAt(snap.sessions);
      if (!lastActivity) {
        if (programHasStarted) {
          alerts.push({
            clientId,
            clientName,
            severity: "high",
            kind: "no_sessions_started",
            message: `${clientName} hasn't started any sessions yet`,
            href,
          });
        }
      } else {
        const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS);
        if (daysSince >= INACTIVITY_THRESHOLD_DAYS) {
          alerts.push({
            clientId,
            clientName,
            severity: "high",
            kind: "inactive",
            message: `${clientName} has been inactive for ${daysSince} days`,
            href,
          });
        }
      }
    }

    const discomfort = snap.recentFeedback.find((f) => f.rating === "MILD_DISCOMFORT");
    if (discomfort) {
      alerts.push({
        clientId,
        clientName,
        severity: "medium",
        kind: "discomfort",
        message: `${clientName} reported mild discomfort recently`,
        href,
      });
    }

    const { rate, scheduled } = computeCompletionRate(snap.sessions, now);
    if (scheduled >= MIN_SESSIONS_FOR_RATE && rate < LOW_COMPLETION_THRESHOLD) {
      alerts.push({
        clientId,
        clientName,
        severity: "medium",
        kind: "low_completion",
        message: `${clientName} completed ${Math.round(rate * 100)}% of scheduled workouts recently`,
        href,
      });
    }

    const variance = computeVarianceBreakdown(snap.sessions, now);
    if (
      variance.delayed >= MIN_DELAYED_FOR_PATTERN &&
      variance.delayed > variance.onTime + variance.early
    ) {
      alerts.push({
        clientId,
        clientName,
        severity: "medium",
        kind: "delayed_pattern",
        message: `${clientName} tends to complete workouts after their scheduled date`,
        href,
      });
    }

    if (snap.activeProgram?.startDate && snap.activeProgram.durationWeeks) {
      const endDate = new Date(
        snap.activeProgram.startDate.getTime() + snap.activeProgram.durationWeeks * 7 * DAY_MS
      );
      const daysToEnd = Math.ceil((endDate.getTime() - now.getTime()) / DAY_MS);
      if (daysToEnd >= 0 && daysToEnd <= PROGRAM_ENDING_SOON_DAYS) {
        alerts.push({
          clientId,
          clientName,
          severity: "medium",
          kind: "program_ending",
          message: `${clientName}'s program ends in ${daysToEnd} day${daysToEnd === 1 ? "" : "s"}`,
          href,
        });
      }
    }

    if (scheduled >= MIN_SESSIONS_FOR_RATE && rate === 1) {
      alerts.push({
        clientId,
        clientName,
        severity: "low",
        kind: "fully_completed",
        message: `${clientName} completed every scheduled workout recently`,
        href,
      });
    }
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function countClientsNeedingAttention(alerts: PriorityAlert[]): number {
  const ids = new Set(alerts.filter((a) => a.severity !== "low").map((a) => a.clientId));
  return ids.size;
}

/**
 * Buckets every client into On Track / At Risk / Off Track by their worst
 * active priority-alert severity — "low" alerts (e.g. fully_completed) don't
 * indicate risk, so a client with only low-severity alerts is On Track.
 */
export function computeClientProgressBreakdown(
  snapshots: ClientSnapshot[],
  alerts: PriorityAlert[]
): ClientProgressBreakdown {
  const worstSeverityByClient = new Map<string, AlertSeverity>();
  for (const alert of alerts) {
    if (alert.severity === "low") continue;
    const current = worstSeverityByClient.get(alert.clientId);
    if (!current || SEVERITY_RANK[alert.severity] < SEVERITY_RANK[current]) {
      worstSeverityByClient.set(alert.clientId, alert.severity);
    }
  }

  let onTrack = 0;
  let atRisk = 0;
  let offTrack = 0;
  for (const snap of snapshots) {
    const severity = worstSeverityByClient.get(snap.clientId);
    if (severity === "high") offTrack += 1;
    else if (severity === "medium") atRisk += 1;
    else onTrack += 1;
  }

  return { onTrack, atRisk, offTrack, total: snapshots.length };
}

export async function getClientSnapshots(
  trainerId: string,
  now: Date = new Date()
): Promise<ClientSnapshot[]> {
  const clients = await getClientsForTrainer(trainerId);
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) return [];

  const historyStart = new Date(now.getTime() - HISTORY_WINDOW_DAYS * DAY_MS);
  const feedbackStart = new Date(now.getTime() - FEEDBACK_LOOKBACK_DAYS * DAY_MS);

  const [sessions, activePrograms, recentFeedback] = await Promise.all([
    prisma.workoutSessionV2.findMany({
      where: { clientId: { in: clientIds }, scheduledDate: { gte: historyStart } },
      select: {
        clientId: true,
        status: true,
        scheduledDate: true,
        completedAt: true,
        startedAt: true,
        scheduleVariance: true,
      },
    }),
    prisma.program.findMany({
      where: { clientId: { in: clientIds }, status: "ACTIVE" },
      select: { clientId: true, name: true, startDate: true, durationWeeks: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.exerciseFeedback.findMany({
      where: { clientId: { in: clientIds }, createdAt: { gte: feedbackStart } },
      select: { clientId: true, rating: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const sessionsByClient = new Map<string, ClientSessionSummary[]>();
  for (const s of sessions) {
    const list = sessionsByClient.get(s.clientId) ?? [];
    list.push({
      status: s.status,
      scheduledDate: s.scheduledDate,
      completedAt: s.completedAt,
      startedAt: s.startedAt,
      scheduleVariance: s.scheduleVariance,
    });
    sessionsByClient.set(s.clientId, list);
  }

  const programByClient = new Map<string, ClientActiveProgram>();
  for (const p of activePrograms) {
    if (p.clientId && !programByClient.has(p.clientId)) {
      programByClient.set(p.clientId, {
        name: p.name,
        startDate: p.startDate,
        durationWeeks: p.durationWeeks,
      });
    }
  }

  const feedbackByClient = new Map<string, { rating: string; createdAt: Date }[]>();
  for (const f of recentFeedback) {
    const list = feedbackByClient.get(f.clientId) ?? [];
    list.push({ rating: f.rating, createdAt: f.createdAt });
    feedbackByClient.set(f.clientId, list);
  }

  return clients.map((c) => ({
    clientId: c.id,
    clientName: `${c.firstName} ${c.lastName}`,
    sessions: sessionsByClient.get(c.id) ?? [],
    activeProgram: programByClient.get(c.id) ?? null,
    recentFeedback: feedbackByClient.get(c.id) ?? [],
  }));
}

export async function getDashboardInsights(
  trainerId: string,
  now: Date = new Date()
): Promise<DashboardInsights> {
  const snapshots = await getClientSnapshots(trainerId, now);

  const allAlerts = buildPriorityAlerts(snapshots, now);
  const clientMetrics: Record<string, ClientMetrics> = {};
  for (const snap of snapshots) {
    clientMetrics[snap.clientId] = {
      programWeek: computeProgramWeek(snap.activeProgram, now),
      streak: computeSessionStreak(snap.sessions, now),
      lastCompletedAt: getLastCompletedAt(snap.sessions),
    };
  }

  return {
    priorities: allAlerts.slice(0, MAX_PRIORITY_ALERTS),
    clientsNeedingAttention: countClientsNeedingAttention(allAlerts),
    sessionsDueToday: countSessionsDueToday(snapshots, now),
    clientMetrics,
    clientProgress: computeClientProgressBreakdown(snapshots, allAlerts),
  };
}
