import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
import { getCurrentUserOrNull, isSuperAdmin } from "@/lib/current-user";
import {
  auditQueryFromFilters,
  getAuditLogsForExport,
  getAuditOrgNames,
} from "@/lib/services/audit-log.service";
import { AUDIT_ACTOR_TYPES, auditActionMeta, parseAuditFilters, type AuditActorTypeKey } from "@/lib/audit/catalog";

/**
 * CSV of the audit log under the same filters as the page. Super admins get
 * every org; a trainer is pinned to their own clinic regardless of `org`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user || !user.isActive) return new NextResponse("Unauthorized", { status: 401 });

  const admin = await isSuperAdmin();
  if (!admin && (user.role !== "TRAINER" || !user.clerkOrgId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const filters = parseAuditFilters(Object.fromEntries(req.nextUrl.searchParams));
  const query = auditQueryFromFilters(filters, admin ? undefined : user.clerkOrgId!);
  const [entries, orgNames] = await Promise.all([getAuditLogsForExport(query), getAuditOrgNames()]);

  const header = ["Timestamp (UTC)", "User", "Role", "Action", "Target type", "Target", "Organization", "Details", "Event ID"];
  const rows = entries.map((e) => [
    e.createdAt.toISOString(),
    e.actorName,
    AUDIT_ACTOR_TYPES[e.actorType as AuditActorTypeKey] ?? e.actorType,
    auditActionMeta(e.action).label,
    e.targetType ?? "",
    e.targetLabel ?? "",
    e.orgId ? (orgNames[e.orgId] ?? e.orgId) : "Platform",
    e.metadata ? JSON.stringify(e.metadata) : "",
    e.id,
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const filename = `audit-log-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Quotes a cell and neutralizes leading =,+,-,@ so spreadsheets don't evaluate it as a formula. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
