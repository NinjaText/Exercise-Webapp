import { ROLE_CLASSES } from "@/lib/ui/status";

/**
 * Shared color map for the workout tracker family (checklist tracker, session
 * tracker, flow, mode wrapper). Every set/exercise/session state renders from
 * this map instead of hand-picked emerald/blue/amber/sky/violet classes.
 * Spec: docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md §3.1
 */
export const WORKOUT_STATE = {
  completed: { ...ROLE_CLASSES.success, ring: "ring-success/40" },
  current: { ...ROLE_CLASSES.info, ring: "ring-info/40" },
  skipped: { ...ROLE_CLASSES.neutral, ring: "ring-border" },
  pain: { ...ROLE_CLASSES.warning, ring: "ring-warning/40" },
  partial: { ...ROLE_CLASSES.warning, ring: "ring-warning/40" },
  abandoned: { ...ROLE_CLASSES.danger, ring: "ring-danger/40" },
} as const;
