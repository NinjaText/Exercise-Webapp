"use client";

import { useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Loader2, Mail, MailCheck, MailX, MailWarning, RotateCw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const STATUS_STYLES: Record<InvitationStatus, { dot: string; text: string; icon: typeof Mail; label: string }> = {
  pending: { dot: "bg-amber-500", text: "text-amber-600", icon: MailWarning, label: "Pending" },
  accepted: { dot: "bg-emerald-500", text: "text-emerald-600", icon: MailCheck, label: "Accepted" },
  expired: { dot: "bg-muted-foreground", text: "text-muted-foreground", icon: MailX, label: "Expired" },
  revoked: { dot: "bg-destructive", text: "text-destructive", icon: Ban, label: "Revoked" },
};

function StatusBadge({ status }: { status: InvitationStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

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
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Email</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sent</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Expires</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((invite) => {
                const isRowPending = isPending && pendingId === invite.id;
                return (
                  <tr key={invite.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3 text-foreground">{invite.email}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={invite.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      {invite.status === "pending"
                        ? formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        {isRowPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : invite.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setRevokeTarget(invite)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        ) : invite.status === "expired" || invite.status === "revoked" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
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
