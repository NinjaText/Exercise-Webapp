import { prisma } from "@/lib/prisma";
import { getActingAdminFor } from "@/lib/clubs/acting-admin-for";
import type { AuditActorType, Prisma, User } from "@prisma/client";

import {
  AUDIT_ACTIONS,
  AUDIT_DATE_RANGES,
  actionsInCategory,
  type AuditAction,
  type AuditLogFilterState,
} from "@/lib/audit/catalog";

export { AUDIT_ACTIONS, type AuditAction };

export interface LogAuditParams {
  actorId?: string | null;
  actorType: AuditActorType;
  actorName: string;
  action: AuditAction | string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  orgId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorType: params.actorType,
        actorName: params.actorName,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetLabel: params.targetLabel,
        orgId: params.orgId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log entry:", error, params);
  }
}

type AuditUser = Pick<User, "id" | "firstName" | "lastName" | "email" | "role" | "clerkOrgId"> & {
  /** Needed to attribute a house-coach action to the admin operating it. */
  clerkId?: string | null;
};
type AuditEvent = Omit<LogAuditParams, "actorId" | "actorType" | "actorName" | "orgId"> & { orgId?: string | null };

/**
 * Records an action a signed-in user took on their own behalf. The event is
 * passed as a builder so that anything that goes wrong while assembling it
 * (a lookup, a missing field) is swallowed along with write failures — audit
 * logging is additive and must never change the outcome of the action itself.
 */
export async function logUserAudit(
  user: AuditUser,
  build: () => AuditEvent | Promise<AuditEvent>
): Promise<void> {
  try {
    const event = await build();
    const admin = await getActingAdminFor(user);
    if (admin) {
      // A super admin acting as the club's house coach: the admin is the actor.
      await logAudit({
        actorId: admin.adminUserId,
        actorType: "SUPER_ADMIN",
        actorName: admin.adminName,
        ...event,
        orgId: event.orgId ?? user.clerkOrgId ?? null,
        metadata: { ...event.metadata, viaHouseCoach: user.id },
      });
      return;
    }
    await logAudit({ ...auditActor(user), ...event, orgId: event.orgId ?? user.clerkOrgId ?? null });
  } catch (error) {
    console.error("Failed to build audit log entry:", error);
  }
}

function fieldValuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[]
): { before: Partial<T>; after: Partial<T> } | undefined {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  let hasChanges = false;

  for (const key of keys) {
    if (key in after && !fieldValuesEqual(after[key], before[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
      hasChanges = true;
    }
  }

  return hasChanges ? { before: changedBefore, after: changedAfter } : undefined;
}

export function deriveActorType(user: { role: "TRAINER" | "CLIENT"; email: string }): AuditActorType {
  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.includes(user.email.toLowerCase())) return "SUPER_ADMIN";
  return user.role === "TRAINER" ? "TRAINER" : "CLIENT";
}

/**
 * The actor fields of an audit entry for a signed-in user acting on their own
 * behalf — the common case for client and trainer actions.
 */
export function auditActor(user: AuditUser) {
  return {
    actorId: user.id,
    actorType: deriveActorType(user),
    actorName: `${user.firstName} ${user.lastName}`.trim() || user.email,
    orgId: user.clerkOrgId ?? null,
  };
}

export interface GetAuditLogsParams {
  orgId?: string;
  actorId?: string;
  actorType?: AuditActorType;
  action?: string;
  actions?: string[];
  targetType?: string;
  /** Case-insensitive match against the actor or the target. */
  search?: string;
  actorNameSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

function buildAuditWhere(params: GetAuditLogsParams): Prisma.AuditLogWhereInput {
  const { orgId, actorId, actorType, action, actions, targetType, search, actorNameSearch, dateFrom, dateTo } = params;
  return {
    ...(orgId && { orgId }),
    ...(actorId && { actorId }),
    ...(actorType && { actorType }),
    ...(action ? { action } : actions && { action: { in: actions } }),
    ...(targetType && { targetType }),
    ...(actorNameSearch && {
      actorName: { contains: actorNameSearch, mode: "insensitive" as const },
    }),
    ...(search && {
      OR: [
        { actorName: { contains: search, mode: "insensitive" as const } },
        { targetLabel: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    }),
  };
}

export async function getAuditLogs(params: GetAuditLogsParams) {
  const { page = 1, pageSize = 25 } = params;
  const where = buildAuditWhere(params);

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Translates URL filter state into query params. `scopeOrgId` pins a clinic's
 * page to its own org and wins over any `org` in the URL.
 */
export function auditQueryFromFilters(
  filters: AuditLogFilterState,
  scopeOrgId?: string
): GetAuditLogsParams {
  return {
    orgId: scopeOrgId ?? filters.org,
    actorId: filters.actor,
    actorType: filters.role,
    action: filters.action,
    actions: filters.category ? actionsInCategory(filters.category) : undefined,
    search: filters.q,
    dateFrom: filters.range ? new Date(Date.now() - AUDIT_DATE_RANGES[filters.range].ms) : undefined,
    page: filters.page,
  };
}

/** Per-actor-type counts for the current filters, ignoring the actor-type filter itself. */
export async function getAuditActorTypeCounts(params: GetAuditLogsParams) {
  const where = buildAuditWhere({ ...params, actorType: undefined });
  const groups = await prisma.auditLog.groupBy({ by: ["actorType"], where, _count: { _all: true } });
  const counts: Record<AuditActorType, number> = { CLIENT: 0, TRAINER: 0, SUPER_ADMIN: 0, SYSTEM: 0 };
  for (const g of groups) counts[g.actorType] = g._count._all;
  return counts;
}

/** Headline numbers for the last 24 hours, optionally scoped to one org. */
export async function getAuditOverview(orgId?: string) {
  const since = new Date(Date.now() - AUDIT_DATE_RANGES["24h"].ms);
  const where: Prisma.AuditLogWhereInput = { createdAt: { gte: since }, ...(orgId && { orgId }) };

  const [events, actors, clientEvents, sensitiveEvents] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["actorId"], where: { ...where, actorId: { not: null } } }),
    prisma.auditLog.count({ where: { ...where, actorType: "CLIENT" } }),
    prisma.auditLog.count({
      where: { ...where, action: { in: SENSITIVE_ACTIONS } },
    }),
  ]);

  return { events, activeUsers: actors.length, clientEvents, sensitiveEvents };
}

/** Destructive or access-changing actions worth surfacing on their own. */
const SENSITIVE_ACTIONS: string[] = [
  AUDIT_ACTIONS.USER_DELETED,
  AUDIT_ACTIONS.USER_DEACTIVATED,
  AUDIT_ACTIONS.USER_INVITE_REVOKED,
  AUDIT_ACTIONS.PROGRAM_DELETED,
  AUDIT_ACTIONS.PROGRAM_HARD_DELETED,
  AUDIT_ACTIONS.GLOBAL_PROGRAM_DELETED,
  AUDIT_ACTIONS.EXERCISE_DELETED,
  AUDIT_ACTIONS.CLINICAL_NOTE_DELETED,
  AUDIT_ACTIONS.BRANDING_RESET,
];

export const AUDIT_EXPORT_LIMIT = 5000;

/** Every entry matching the filters, newest first, capped for CSV export. */
export async function getAuditLogsForExport(params: GetAuditLogsParams) {
  return prisma.auditLog.findMany({
    where: buildAuditWhere(params),
    orderBy: { createdAt: "desc" },
    take: AUDIT_EXPORT_LIMIT,
  });
}

/**
 * clerkOrgId → display name for every clinic, used by the org filter and the
 * Organization column. Falls back to the owning trainer's name for clinics
 * that predate the Organization table.
 */
export async function getAuditOrgNames(): Promise<Record<string, string>> {
  const [orgs, trainers] = await Promise.all([
    prisma.organization.findMany({ select: { clerkOrgId: true, name: true } }),
    prisma.user.findMany({
      where: { role: "TRAINER", clerkOrgId: { not: null } },
      select: { clerkOrgId: true, firstName: true, lastName: true },
    }),
  ]);
  const names: Record<string, string> = {};
  for (const t of trainers) {
    if (t.clerkOrgId) names[t.clerkOrgId] = `${t.firstName} ${t.lastName}`.trim();
  }
  for (const o of orgs) if (o.name) names[o.clerkOrgId] = o.name;
  return names;
}
