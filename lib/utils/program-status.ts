/**
 * PlanStatus badge styling, shared by the trainer's program table and the
 * client's program cards so a "Paused" program looks identical on both.
 *
 * Lives in lib/utils (not the service layer) so client components can import it
 * without pulling Prisma into the browser bundle.
 */
export interface ProgramStatusConfig {
  label: string;
  className: string;
}

export const PROGRAM_STATUS_CONFIG: Record<string, ProgramStatusConfig> = {
  ACTIVE:    { label: "Active",    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  DRAFT:     { label: "Draft",     className: "bg-muted text-muted-foreground border-border" },
  PAUSED:    { label: "Paused",    className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  COMPLETED: { label: "Completed", className: "bg-muted text-muted-foreground border-border" },
  ARCHIVED:  { label: "Archived",  className: "bg-muted text-muted-foreground border-border opacity-70" },
};

/** Falls back to the raw status as its own label so an unknown value still renders. */
export function getProgramStatusConfig(status: string): ProgramStatusConfig {
  return (
    PROGRAM_STATUS_CONFIG[status] ?? {
      label: status,
      className: "bg-muted text-muted-foreground border-border",
    }
  );
}
