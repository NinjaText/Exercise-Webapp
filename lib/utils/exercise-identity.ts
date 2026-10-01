import type { ExerciseSource } from "@prisma/client";
import { extractYouTubeId, isYouTubeUrl } from "@/lib/utils/video";

// Exercise uniqueness rules, shared by the write-path checks
// (lib/services/exercise-uniqueness.ts) and the one-off dedupe script
// (scripts/dedupe-exercises.ts) so both agree on what "duplicate" means.
//
// Two exercises conflict when some organization can see both of them — i.e.
// both are UNIVERSAL, one is UNIVERSAL, or both belong to the same org — and
// they share a normalized name or the same video. Exercises in two different
// orgs never conflict, and inactive (archived) exercises are ignored.

export interface ExerciseIdentity {
  id?: string;
  name: string;
  videoUrl?: string | null;
  source: ExerciseSource;
  organizationId?: string | null;
}

export type ExerciseConflictField = "name" | "videoUrl";

export interface ExerciseConflict {
  field: ExerciseConflictField;
  existing: { id?: string; name: string };
}

/** "Sit-to-Stand", "sit to stand" and " SIT  TO STAND " all normalize to "sit to stand". */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Comparable key for a video link: the YouTube video id for any YouTube URL
 * shape (watch, youtu.be, embed, shorts), otherwise the trimmed URL. Search
 * result links (the placeholder the seed data uses) aren't a specific video,
 * so they never count as a duplicate.
 */
export function exerciseVideoKey(videoUrl: string | null | undefined): string | null {
  const url = videoUrl?.trim();
  if (!url) return null;
  if (isYouTubeUrl(url)) {
    if (url.includes("youtube.com/results")) return null;
    const id = extractYouTubeId(url);
    if (id) return `yt:${id}`;
  }
  return url.replace(/\/+$/, "").toLowerCase();
}

export function exercisesShareScope(
  a: Pick<ExerciseIdentity, "source" | "organizationId">,
  b: Pick<ExerciseIdentity, "source" | "organizationId">
): boolean {
  if (a.source === "UNIVERSAL" || b.source === "UNIVERSAL") return true;
  return !!a.organizationId && a.organizationId === b.organizationId;
}

/** First name conflict and first video conflict between `candidate` and `pool` (excluding itself). */
export function findExerciseConflicts(
  candidate: ExerciseIdentity,
  pool: readonly ExerciseIdentity[]
): ExerciseConflict[] {
  const nameKey = normalizeExerciseName(candidate.name);
  const videoKey = exerciseVideoKey(candidate.videoUrl);
  let nameHit: ExerciseIdentity | undefined;
  let videoHit: ExerciseIdentity | undefined;

  for (const other of pool) {
    if (candidate.id && other.id === candidate.id) continue;
    if (!exercisesShareScope(candidate, other)) continue;
    if (!nameHit && nameKey && normalizeExerciseName(other.name) === nameKey) nameHit = other;
    if (!videoHit && videoKey && exerciseVideoKey(other.videoUrl) === videoKey) videoHit = other;
    if (nameHit && (videoHit || !videoKey)) break;
  }

  const conflicts: ExerciseConflict[] = [];
  if (nameHit) conflicts.push({ field: "name", existing: { id: nameHit.id, name: nameHit.name } });
  if (videoHit) conflicts.push({ field: "videoUrl", existing: { id: videoHit.id, name: videoHit.name } });
  return conflicts;
}

export function describeExerciseConflict(conflict: ExerciseConflict): string {
  return conflict.field === "name"
    ? `An exercise named "${conflict.existing.name}" already exists in your library`
    : `This video is already used by "${conflict.existing.name}"`;
}
