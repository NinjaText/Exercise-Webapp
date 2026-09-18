/**
 * Single source of truth for mapping domain status strings to visual roles.
 * Every badge, dot, and stat color in the app derives from this file.
 * Spec: docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md §3.1
 */

export const STATUS_ROLES = [
  "info",
  "success",
  "warning",
  "danger",
  "neutral",
  "brand",
] as const;

export type StatusRole = (typeof STATUS_ROLES)[number];

const ROLE_BY_STATUS: Record<string, StatusRole> = {
  // Sessions / calendar day states
  SCHEDULED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  MISSED: "warning",
  SKIPPED: "neutral",
  ABANDONED: "danger",

  // Plan / program lifecycle (PlanStatus + derived assigned-program states)
  DRAFT: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "neutral",
  ON_HOLD: "warning",
  STARTING_SOON: "info",

  // Subscription (SubStatus)
  TRIALING: "warning",
  PAST_DUE: "warning",
  CANCELED: "danger",
  UNPAID: "danger",

  // Client progress buckets (dashboard-insights.service)
  ON_TRACK: "success",
  AT_RISK: "warning",
  OFF_TRACK: "danger",

  // Schedule variance (adherence page)
  ON_TIME: "success",
  EARLY: "info",
  LATE: "warning",
  DELAYED: "warning",

  // Program type and flags
  RESOURCE: "neutral",
  TEMPLATE: "neutral",
  INACTIVE: "neutral",
  AI_GENERATED: "brand",
  INSIGHT: "brand",

  // Priority (todays-priorities-card)
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "success",

  // Users / visibility / invitations
  TRAINER: "brand",
  CLIENT: "info",
  SUPER_ADMIN: "brand",
  PUBLIC: "success",
  PRIVATE: "neutral",
  PENDING: "warning",
  ACCEPTED: "success",
  REVOKED: "neutral",
  EXPIRED: "neutral",
  ONBOARDING: "info",
};

/**
 * Exercise difficulty -> visual role. Lives here rather than in
 * components/exercises/exercise-card.tsx because that is a "use client"
 * module, and a server component importing this map from it would receive a
 * client reference instead of the object (every lookup then falls back to
 * "neutral").
 */
export const DIFFICULTY_ROLE: Record<string, StatusRole> = {
  BEGINNER: "success",
  INTERMEDIATE: "warning",
  ADVANCED: "danger",
};

/** "onTrack" | "on track" | "on-track" -> "ON_TRACK" */
export function normalizeStatus(status: string): string {
  return status
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function statusRole(status: string | null | undefined): StatusRole {
  if (!status) return "neutral";
  return ROLE_BY_STATUS[normalizeStatus(status)] ?? "neutral";
}

/** "IN_PROGRESS" -> "In progress" */
export function statusLabel(status: string): string {
  const words = normalizeStatus(status).toLowerCase().split("_");
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const ROLE_CLASSES: Record<
  StatusRole,
  { soft: string; text: string; dot: string; border: string }
> = {
  info: { soft: "bg-info-soft", text: "text-info-foreground", dot: "bg-info", border: "border-info-border" },
  success: { soft: "bg-success-soft", text: "text-success-foreground", dot: "bg-success", border: "border-success-border" },
  warning: { soft: "bg-warning-soft", text: "text-warning-foreground", dot: "bg-warning", border: "border-warning-border" },
  danger: { soft: "bg-danger-soft", text: "text-danger-foreground", dot: "bg-danger", border: "border-danger-border" },
  neutral: { soft: "bg-neutral-soft", text: "text-neutral-foreground", dot: "bg-neutral", border: "border-neutral-border" },
  brand: { soft: "bg-brand-soft", text: "text-brand-foreground", dot: "bg-brand", border: "border-brand-border" },
};
