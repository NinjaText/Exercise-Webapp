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

/**
 * Touch-first sizing for in-workout controls (spec §4): 44px targets on
 * phones, the standard 36px from `sm` up. Inputs keep the Input primitive's
 * 16px phone font so iOS never zooms the page while a client logs a set.
 */
export const WORKOUT_TOUCH = "h-11 sm:h-9";
export const WORKOUT_TOUCH_ICON = "size-11 sm:size-9";
/** A set-log field: a <label> wrapping its caption and input, so every input is labelled. */
export const SET_FIELD = "flex flex-col gap-1";
export const SET_FIELD_LABEL = "text-caption font-medium";
export const SET_FIELD_INPUT = "h-11 tabular-nums sm:h-9";
/** The non-input "Rest 60s" cell, aligned to the inputs' height. */
export const SET_FIELD_STATIC = "flex h-11 items-center text-body text-muted-foreground sm:h-9";
