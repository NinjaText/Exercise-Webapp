import { prisma } from "@/lib/prisma";
import type { AuditActorType, Prisma } from "@prisma/client";

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  USER_INVITED: "USER_INVITED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USER_REACTIVATED: "USER_REACTIVATED",
  USER_DELETED: "USER_DELETED",
  CLINICAL_NOTE_CREATED: "CLINICAL_NOTE_CREATED",
  CLINICAL_NOTE_UPDATED: "CLINICAL_NOTE_UPDATED",
  CLINICAL_NOTE_DELETED: "CLINICAL_NOTE_DELETED",
  PROGRAM_CREATED: "PROGRAM_CREATED",
  PROGRAM_UPDATED: "PROGRAM_UPDATED",
  PROGRAM_DELETED: "PROGRAM_DELETED",
  PROGRAM_HARD_DELETED: "PROGRAM_HARD_DELETED",
  GLOBAL_PROGRAM_CREATED: "GLOBAL_PROGRAM_CREATED",
  GLOBAL_PROGRAM_UPDATED: "GLOBAL_PROGRAM_UPDATED",
  GLOBAL_PROGRAM_DELETED: "GLOBAL_PROGRAM_DELETED",
  EXERCISE_CREATED: "EXERCISE_CREATED",
  EXERCISE_UPDATED: "EXERCISE_UPDATED",
  EXERCISE_DELETED: "EXERCISE_DELETED",
  CLINIC_SETTINGS_UPDATED: "CLINIC_SETTINGS_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

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

export interface GetAuditLogsParams {
  orgId?: string;
  actorId?: string;
  action?: string;
  targetType?: string;
  actorNameSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export async function getAuditLogs(params: GetAuditLogsParams) {
  const {
    orgId,
    actorId,
    action,
    targetType,
    actorNameSearch,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 25,
  } = params;

  const where = {
    ...(orgId && { orgId }),
    ...(actorId && { actorId }),
    ...(action && { action }),
    ...(targetType && { targetType }),
    ...(actorNameSearch && {
      actorName: { contains: actorNameSearch, mode: "insensitive" as const },
    }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    }),
  };

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
