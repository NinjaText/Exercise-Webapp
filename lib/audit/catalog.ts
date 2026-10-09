/**
 * Single source of truth for audit log actions: the stored action string, its
 * human label, the category it's filed under and the badge tone it renders
 * with. Deliberately free of server imports so both the audit service and the
 * client-side filter/table components can use it.
 */
import type { StatusRole } from "@/lib/ui/status";

export const AUDIT_CATEGORIES = {
  ACCESS: "Account & access",
  USERS: "Users & invitations",
  WORKOUTS: "Workouts",
  PROGRAMS: "Programs",
  EXERCISES: "Exercises",
  CLINICAL: "Clinical & profiles",
  ENGAGEMENT: "Check-ins & feedback",
  HEALTH: "Nutrition & progress",
  ORGANIZATION: "Clinic & branding",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

interface AuditActionMeta {
  label: string;
  category: AuditCategory;
  tone: StatusRole;
}

/** Keyed by the action string written to AuditLog.action. */
export const AUDIT_ACTION_CATALOG = {
  LOGIN: { label: "Signed in", category: "ACCESS", tone: "neutral" },
  LOGOUT: { label: "Signed out", category: "ACCESS", tone: "neutral" },
  ONBOARDING_COMPLETED: { label: "Completed onboarding", category: "ACCESS", tone: "success" },

  USER_INVITED: { label: "Invited user", category: "USERS", tone: "success" },
  USER_INVITE_REVOKED: { label: "Revoked invitation", category: "USERS", tone: "danger" },
  USER_DEACTIVATED: { label: "Deactivated user", category: "USERS", tone: "danger" },
  USER_REACTIVATED: { label: "Reactivated user", category: "USERS", tone: "success" },
  USER_DELETED: { label: "Deleted user", category: "USERS", tone: "danger" },

  WORKOUT_STARTED: { label: "Started workout", category: "WORKOUTS", tone: "info" },
  WORKOUT_COMPLETED: { label: "Completed workout", category: "WORKOUTS", tone: "success" },

  PROGRAM_CREATED: { label: "Created program", category: "PROGRAMS", tone: "success" },
  PROGRAM_UPDATED: { label: "Updated program", category: "PROGRAMS", tone: "info" },
  PROGRAM_DELETED: { label: "Deleted program", category: "PROGRAMS", tone: "danger" },
  PROGRAM_HARD_DELETED: { label: "Permanently deleted program", category: "PROGRAMS", tone: "danger" },
  PROGRAM_UNPUBLISHED: { label: "Unpublished program", category: "PROGRAMS", tone: "warning" },
  GLOBAL_PROGRAM_CREATED: { label: "Created global program", category: "PROGRAMS", tone: "success" },
  GLOBAL_PROGRAM_UPDATED: { label: "Updated global program", category: "PROGRAMS", tone: "info" },
  GLOBAL_PROGRAM_DELETED: { label: "Deleted global program", category: "PROGRAMS", tone: "danger" },

  EXERCISE_CREATED: { label: "Created exercise(s)", category: "EXERCISES", tone: "success" },
  EXERCISE_UPDATED: { label: "Updated exercise", category: "EXERCISES", tone: "info" },
  EXERCISE_DELETED: { label: "Deleted exercise", category: "EXERCISES", tone: "danger" },

  CLINICAL_NOTE_CREATED: { label: "Created clinical note", category: "CLINICAL", tone: "success" },
  CLINICAL_NOTE_UPDATED: { label: "Updated clinical note", category: "CLINICAL", tone: "info" },
  CLINICAL_NOTE_DELETED: { label: "Deleted clinical note", category: "CLINICAL", tone: "danger" },
  CLIENT_PROFILE_UPDATED: { label: "Updated client profile", category: "CLINICAL", tone: "info" },
  EQUIPMENT_PROFILE_CREATED: { label: "Saved equipment profile", category: "CLINICAL", tone: "success" },
  EQUIPMENT_PROFILE_UPDATED: { label: "Updated equipment profile", category: "CLINICAL", tone: "info" },
  EQUIPMENT_PROFILE_DELETED: { label: "Deleted equipment profile", category: "CLINICAL", tone: "danger" },
  CLIENT_EQUIPMENT_UPDATED: { label: "Updated own equipment", category: "CLINICAL", tone: "info" },

  CHECK_IN_ASSIGNED: { label: "Assigned check-in", category: "ENGAGEMENT", tone: "success" },
  CHECK_IN_SUBMITTED: { label: "Submitted check-in", category: "ENGAGEMENT", tone: "success" },
  CHECK_IN_REVIEWED: { label: "Reviewed check-in", category: "ENGAGEMENT", tone: "info" },
  FEEDBACK_SUBMITTED: { label: "Submitted exercise feedback", category: "ENGAGEMENT", tone: "info" },
  FEEDBACK_RESPONDED: { label: "Replied to feedback", category: "ENGAGEMENT", tone: "info" },
  COACHING_REQUESTED: { label: "Requested coaching", category: "ENGAGEMENT", tone: "info" },
  COACHING_ACCEPTED: { label: "Accepted coaching request", category: "ENGAGEMENT", tone: "success" },
  COACHING_DECLINED: { label: "Declined coaching request", category: "ENGAGEMENT", tone: "warning" },
  COACHING_WITHDRAWN: { label: "Withdrew coaching", category: "ENGAGEMENT", tone: "warning" },
  COACHING_ENDED: { label: "Ended coaching", category: "ENGAGEMENT", tone: "danger" },

  MEAL_LOGGED: { label: "Logged meal", category: "HEALTH", tone: "info" },
  MEAL_DELETED: { label: "Deleted meal", category: "HEALTH", tone: "danger" },
  PROGRESS_PHOTO_ADDED: { label: "Added progress photo", category: "HEALTH", tone: "info" },
  PROGRESS_PHOTO_DELETED: { label: "Deleted progress photo", category: "HEALTH", tone: "danger" },
  BODY_METRIC_RECORDED: { label: "Recorded body metric", category: "HEALTH", tone: "info" },

  CLINIC_SETTINGS_UPDATED: { label: "Updated clinic settings", category: "ORGANIZATION", tone: "info" },
  BRANDING_UPDATED: { label: "Updated branding", category: "ORGANIZATION", tone: "info" },
  BRANDING_RESET: { label: "Reset branding to defaults", category: "ORGANIZATION", tone: "warning" },
  CLUB_CREATED: { label: "Created club", category: "ORGANIZATION", tone: "success" },
  CLUB_UPDATED: { label: "Updated club", category: "ORGANIZATION", tone: "info" },
  CLUB_SESSION_STARTED: { label: "Entered club as house coach", category: "ACCESS", tone: "warning" },
  CLUB_SESSION_ENDED: { label: "Exited club", category: "ACCESS", tone: "neutral" },
  // Historical: the invited club trainer was replaced by the house coach; kept so old log rows still render.
  CLUB_TRAINER_INVITED: { label: "Invited club trainer", category: "USERS", tone: "info" },
  CLUB_TRAINER_REMOVED: { label: "Removed club trainer", category: "USERS", tone: "warning" },
  CLUB_TRAINER_ONBOARDED: { label: "Club trainer completed onboarding", category: "USERS", tone: "success" },
  ORG_TYPE_CHANGED: { label: "Changed org type", category: "ORGANIZATION", tone: "warning" },
  MEMBER_TRIAL_EXTENDED: { label: "Extended member trial", category: "USERS", tone: "info" },
} as const satisfies Record<string, AuditActionMeta>;

export type AuditAction = keyof typeof AUDIT_ACTION_CATALOG;

export const AUDIT_ACTIONS = Object.fromEntries(
  Object.keys(AUDIT_ACTION_CATALOG).map((k) => [k, k])
) as { [K in AuditAction]: K };

/** Falls back gracefully for action strings written before they were catalogued. */
export function auditActionMeta(action: string): AuditActionMeta {
  const known = (AUDIT_ACTION_CATALOG as Record<string, AuditActionMeta>)[action];
  if (known) return known;
  const label = action.toLowerCase().replace(/_/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), category: "ACCESS", tone: "neutral" };
}

export function actionsInCategory(category: AuditCategory): AuditAction[] {
  return (Object.keys(AUDIT_ACTION_CATALOG) as AuditAction[]).filter(
    (a) => AUDIT_ACTION_CATALOG[a].category === category
  );
}

export const AUDIT_ACTOR_TYPES = {
  CLIENT: "Client",
  TRAINER: "Trainer",
  SUPER_ADMIN: "Admin",
  SYSTEM: "System",
} as const;

export type AuditActorTypeKey = keyof typeof AUDIT_ACTOR_TYPES;

export const AUDIT_ACTOR_TONE: Record<AuditActorTypeKey, StatusRole> = {
  CLIENT: "info",
  TRAINER: "brand",
  SUPER_ADMIN: "warning",
  SYSTEM: "neutral",
};

export const AUDIT_DATE_RANGES = {
  "24h": { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  "30d": { label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  "90d": { label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
} as const;

export type AuditDateRange = keyof typeof AUDIT_DATE_RANGES;

/**
 * Filter state shared by the admin and clinic audit log pages. Parsed once
 * from the URL on the server, and rebuilt into a URL by the filter bar.
 */
export interface AuditLogFilterState {
  q?: string;
  role?: AuditActorTypeKey;
  category?: AuditCategory;
  action?: string;
  org?: string;
  actor?: string;
  range?: AuditDateRange;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export function parseAuditFilters(params: RawParams): AuditLogFilterState {
  const role = one(params.role);
  const category = one(params.category);
  const range = one(params.range);
  const actor = one(params.actor);
  const page = parseInt(one(params.page) ?? "1", 10);
  return {
    q: one(params.q)?.slice(0, 100),
    role: role && role in AUDIT_ACTOR_TYPES ? (role as AuditActorTypeKey) : undefined,
    category: category && category in AUDIT_CATEGORIES ? (category as AuditCategory) : undefined,
    action: one(params.action),
    org: one(params.org),
    // actorId is a Mongo ObjectId — reject anything else so Prisma never throws on it.
    actor: actor && /^[a-f0-9]{24}$/i.test(actor) ? actor : undefined,
    range: range && range in AUDIT_DATE_RANGES ? (range as AuditDateRange) : undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Serializes filter state back into a query string (page omitted when 1). */
export function auditFiltersToQuery(state: Partial<AuditLogFilterState>): string {
  const params = new URLSearchParams();
  for (const key of ["q", "role", "category", "action", "org", "actor", "range"] as const) {
    const value = state[key];
    if (value) params.set(key, value);
  }
  if (state.page && state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** "WorkoutSession" → "Workout session" */
export function humanizeType(type: string) {
  const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
