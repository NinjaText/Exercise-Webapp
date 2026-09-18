import { cn } from "@/lib/utils";
import {
  ROLE_CLASSES,
  statusLabel,
  statusRole,
  type StatusRole,
} from "@/lib/ui/status";

export interface StatusBadgeProps {
  /** Domain status string, e.g. "COMPLETED", "IN_PROGRESS", "onTrack". */
  status: string;
  /** Overrides the humanized label derived from `status`. */
  label?: string;
  /** Overrides the role derived from `status`. */
  role?: StatusRole;
  /** Show the leading colored dot. Defaults to true. */
  dot?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * The one status chip. Colors come from lib/ui/status.ts, never from callers.
 */
export function StatusBadge({
  status,
  label,
  role,
  dot = true,
  size = "default",
  className,
}: StatusBadgeProps) {
  const resolvedRole = role ?? statusRole(status);
  const classes = ROLE_CLASSES[resolvedRole];

  return (
    <span
      data-slot="status-badge"
      data-role={resolvedRole}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        classes.soft,
        classes.text,
        classes.border,
        className
      )}
    >
      {dot && (
        <span
          data-slot="status-dot"
          aria-hidden
          className={cn("size-1.5 rounded-full", classes.dot)}
        />
      )}
      {label ?? statusLabel(status)}
    </span>
  );
}
