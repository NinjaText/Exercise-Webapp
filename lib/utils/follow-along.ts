/**
 * Follow-along video programs.
 *
 * A FOLLOW_ALONG program is a run of days where each workout is one long-form
 * video the client plays start to finish (Workout.videoUrl) instead of logged
 * exercise blocks. Rest days are simply days with no workout row.
 *
 * Lives in lib/utils (not the service layer) so client components can use it
 * without pulling Prisma into the browser bundle.
 */

import { extractYouTubeId, isYouTubeUrl } from "@/lib/utils/video";

export const FOLLOW_ALONG_CONTENT_FORMAT = "FOLLOW_ALONG" as const;

/** A follow-along program can run at most a year (the week/day caps alone would allow 728 days). */
export const MAX_FOLLOW_ALONG_DAYS = 365;

/** Largest trainer-uploaded follow-along video, in bytes (2 GB). */
export const MAX_FOLLOW_ALONG_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/** Upper bound on the client's "How did it go?" comment. */
export const FOLLOW_ALONG_COMMENT_MAX_LENGTH = 500;

/**
 * `Program.contentFormat` is optional with no default (Mongo has no
 * migrations), so read it only through this helper — every legacy document
 * reads back as a normal exercise-based program.
 */
export function isFollowAlongProgram(program: { contentFormat?: string | null } | null | undefined): boolean {
  return program?.contentFormat === FOLLOW_ALONG_CONTENT_FORMAT;
}

/**
 * YouTube id only when the URL is actually on a YouTube host — extractYouTubeId
 * alone matches `?v=` on any host, which would misroute an R2 file URL.
 */
export function getYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || !isYouTubeUrl(url)) return null;
  return extractYouTubeId(url);
}

/** A workout is played as a follow-along video when it carries a video URL. */
export function isVideoWorkout(workout: { videoUrl?: string | null } | null | undefined): boolean {
  return !!workout?.videoUrl?.trim();
}

/** 1-based program day for a workout's week/day position ("Day 12"). */
export function dayNumberFromIndices(weekIndex: number, dayIndex: number): number {
  return weekIndex * 7 + dayIndex + 1;
}

/** Inverse of dayNumberFromIndices: Day N → its week/day slot and default orderIndex. */
export function indicesFromDayNumber(dayNumber: number): {
  weekIndex: number;
  dayIndex: number;
  orderIndex: number;
} {
  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    throw new RangeError(`Day number must be a positive integer, got ${dayNumber}`);
  }
  const weekIndex = Math.floor((dayNumber - 1) / 7);
  const dayIndex = (dayNumber - 1) % 7;
  return { weekIndex, dayIndex, orderIndex: weekIndex * 7 + dayIndex };
}

/**
 * Number of days a follow-along program spans.
 *
 * Rest days have no row, so the stored workouts alone can't tell a program
 * that ends on rest days from a shorter one. The editor saves
 * durationWeeks = ceil(days / 7), which every copy path carries, so:
 * - last video day in the final week → the last video day (exact for the
 *   common case; at most six trailing rest days of that week are dropped);
 * - whole trailing rest weeks → durationWeeks × 7 (capped at the max).
 * Stable across save → load → save.
 */
export function getFollowAlongTotalDays(
  workouts: { weekIndex: number; dayIndex: number }[],
  durationWeeks?: number | null
): number {
  const lastVideoDay = workouts.reduce((max, w) => Math.max(max, dayNumberFromIndices(w.weekIndex, w.dayIndex)), 0);
  if (!durationWeeks || durationWeeks < 1) return lastVideoDay;
  const weeksSpan = Math.min(MAX_FOLLOW_ALONG_DAYS, durationWeeks * 7);
  return lastVideoDay > weeksSpan - 7 ? lastVideoDay : weeksSpan;
}

/** "Day 12 of 90" — drops "of M" when the total isn't known. */
export function formatDayOfTotal(dayNumber: number, totalDays?: number | null): string {
  return totalDays && totalDays >= dayNumber ? `Day ${dayNumber} of ${totalDays}` : `Day ${dayNumber}`;
}

// --- "How did it go?" ---

export const FEELING_RATINGS = ["HARD", "CHALLENGING", "JUST_RIGHT", "EASY", "GREAT"] as const;
export type FeelingRating = (typeof FEELING_RATINGS)[number];

export const FEELING_LABELS: Record<FeelingRating, string> = {
  HARD: "Hard",
  CHALLENGING: "Challenging",
  JUST_RIGHT: "Just right",
  EASY: "Easy",
  GREAT: "Great",
};

/** Options in the order the client sees them (hardest → best). */
export const FEELING_OPTIONS: { value: FeelingRating; label: string }[] = FEELING_RATINGS.map((value) => ({
  value,
  label: FEELING_LABELS[value],
}));

export function isFeelingRating(value: unknown): value is FeelingRating {
  return typeof value === "string" && (FEELING_RATINGS as readonly string[]).includes(value);
}

/** Label for a stored rating; unknown/legacy values read as null rather than leaking the raw enum. */
export function getFeelingLabel(value: string | null | undefined): string | null {
  return isFeelingRating(value) ? FEELING_LABELS[value] : null;
}

// --- Durations ---

/** "15 min", "1 h 5 min", "45 sec" — for cards and meta lines. */
export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} sec`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Countdown clock: "14:05", or "1:02:09" past an hour. Negative input clamps to 0. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "Follow-along · 15 min" — the one-line meta used wherever a normal workout shows its exercise count. */
export function formatFollowAlongMetaLine(videoDurationSec: number | null | undefined): string {
  const duration = formatDuration(videoDurationSec);
  return duration ? `Follow-along · ${duration}` : "Follow-along";
}

/** Whole minutes for WorkoutSessionV2.durationMinutes from seconds watched (≥ 1 once anything played). */
export function watchedSecondsToMinutes(watchedSeconds: number): number {
  if (watchedSeconds <= 0) return 0;
  return Math.max(1, Math.round(watchedSeconds / 60));
}
