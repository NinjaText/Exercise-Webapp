/**
 * Scheduled vs. On-Demand programs.
 *
 * SCHEDULED — a normal dated program: it has a start date and pre-generated
 * WorkoutSessionV2 rows, and counts toward adherence.
 * ON_DEMAND ("Resources": warm-ups, mobility, recovery) — no schedule at all.
 * Sessions are created lazily when the client actually starts one, so the
 * mark-missed-sessions cron can never flag a resource as non-compliance.
 *
 * Lives in lib/utils (not the service layer) so client components can import
 * it without pulling Prisma into the browser bundle; program.service.ts
 * re-exports it for server-side callers.
 */
export type ProgramSchedulingTypeValue = "SCHEDULED" | "ON_DEMAND";

/**
 * Reads a program's scheduling type with the legacy-safe default.
 *
 * `Program.schedulingType` is deliberately optional in the schema (Mongo has no
 * migrations), so every document written before the field existed reads back as
 * null. Always resolve the value through this helper rather than comparing
 * `program.schedulingType` directly, so those older programs keep behaving
 * exactly as they do today: as normal Scheduled programs.
 */
export function getProgramSchedulingType(program: {
  schedulingType?: string | null;
}): ProgramSchedulingTypeValue {
  return program.schedulingType === "ON_DEMAND" ? "ON_DEMAND" : "SCHEDULED";
}

/** Human-facing label for a scheduling type — "Resource" reads better than "On-Demand" in the UI. */
export function getProgramSchedulingLabel(program: {
  schedulingType?: string | null;
}): "Scheduled" | "Resource" {
  return getProgramSchedulingType(program) === "ON_DEMAND" ? "Resource" : "Scheduled";
}
