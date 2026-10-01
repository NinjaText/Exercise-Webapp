/**
 * Club members work through the club's starter list in order. A program copy
 * remembers its template in `Program.sourceTemplateId`, so "already assigned"
 * is the set of those ids on the member's programs.
 */
export function nextStarterTemplateId(starterIds: string[], assignedSourceIds: string[]): string | null {
  const assigned = new Set(assignedSourceIds);
  return starterIds.find((id) => !assigned.has(id)) ?? null;
}

/**
 * A program is finished when none of its sessions are still open. Programs are
 * never marked COMPLETED in this codebase; stale SCHEDULED sessions become
 * MISSED via the mark-missed-sessions cron.
 */
export const OPEN_SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;
