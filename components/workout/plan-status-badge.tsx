import { StatusBadge } from "@/components/shared/status-badge";

/** Thin wrapper: plan lifecycle statuses (DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED)
 * are already mapped to roles in lib/ui/status.ts. */
export function PlanStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}
