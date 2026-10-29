"use client";

import { useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Loader2, Mail, RotateCw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  revokeInvitationAction,
  resendInvitationAction,
} from "@/actions/invitation-actions";
import type { InvitationStatus, OrgInvitation } from "@/lib/services/invitation.service";

interface Props {
  invitations: OrgInvitation[];
  clerkOrgId?: string; // present only when rendered from the admin panel
  onChanged?: () => void;
}

const FILTERS: { key: InvitationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

const STATUS_ROLE: Record<InvitationStatus, "warning" | "success" | "neutral"> = {
  pending: "warning",
  accepted: "success",
  expired: "neutral",
  revoked: "neutral",
};

export function InvitationsTable({ invitations, clerkOrgId, onChanged }: Props) {
  const [filter, setFilter] = useState<InvitationStatus | "all">("all");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OrgInvitation | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invitations.length };
    for (const inv of invitations) c[inv.status] = (c[inv.status] ?? 0) + 1;
    return c;
  }, [invitations]);

  const filtered = filter === "all" ? invitations : invitations.filter((i) => i.status === filter);

  function handleRevoke(invite: OrgInvitation) {
    setPendingId(invite.id);
    startTransition(async () => {
      const result = await revokeInvitationAction(invite.id, invite.email, clerkOrgId);
      if (result.success) {
        toast.success(`Invitation to ${invite.email} revoked`);
        onChanged?.();
      } else {
        toast.error(result.error ?? "Failed to revoke invitation");
      }
      setPendingId(null);
      setRevokeTarget(null);
    });
  }

  function handleResend(invite: OrgInvitation) {
    setPendingId(invite.id);
    startTransition(async () => {
      const result = await resendInvitationAction(invite.email, clerkOrgId);
      if (result.success) {
        toast.success(`Invitation resent to ${invite.email}`);
        onChanged?.();
      } else {
        toast.error(result.error ?? "Failed to resend invitation");
      }
      setPendingId(null);
    });
  }

  if (invitations.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No invitations yet"
        description="Invitations you send will show up here with their status."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium sm:py-1 transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {f.label}
            {counts[f.key] ? ` · ${counts[f.key]}` : ""}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {/* Phones: each row becomes a compact card (email on top, status and
              sent time below, the row action in the top-right corner). */}
          <table className="w-full text-sm max-sm:block">
            <thead className="max-sm:sr-only">
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Email</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sent</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Expires</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border max-sm:block">
              {filtered.map((invite) => {
                const isRowPending = isPending && pendingId === invite.id;
                return (
                  <tr key={invite.id} className="hover:bg-muted/40 transition-colors max-sm:relative max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:px-4 max-sm:py-3">
                    <td className="px-5 py-3 text-foreground max-sm:block max-sm:w-full max-sm:p-0 max-sm:pr-24 max-sm:break-all">{invite.email}</td>
                    <td className="px-5 py-3 max-sm:p-0">
                      <StatusBadge status={invite.status} role={STATUS_ROLE[invite.status]} size="sm" />
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap max-sm:p-0">
                      {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      {invite.status === "pending"
                        ? formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-5 py-3 max-sm:absolute max-sm:top-2 max-sm:right-2 max-sm:p-0">
                      <div className="flex justify-end">
                        {isRowPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : invite.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 gap-1 px-2 text-xs text-destructive hover:text-destructive sm:h-7"
                            onClick={() => setRevokeTarget(invite)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        ) : invite.status === "expired" || invite.status === "revoked" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 gap-1 px-2 text-xs sm:h-7"
                            onClick={() => handleResend(invite)}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            Resend
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation to {revokeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to use this invitation to join. You can send a new one anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && handleRevoke(revokeTarget)}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Revoking…" : "Revoke invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
