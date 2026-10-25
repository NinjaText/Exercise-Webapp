"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, CircleAlert, CircleCheck, Landmark, Link2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { ROLE_CLASSES } from "@/lib/ui/status";
import { badgeFor, CONNECT_STATUS_BADGE } from "@/lib/payments/status-badges";
import type { ConnectStatus } from "@/lib/services/connected-account.service";
import {
  disconnectConnectedAccountAction,
  startConnectOAuthAction,
  startConnectOnboardingAction,
} from "@/actions/payment-actions";

export interface ConnectStatusCardProps {
  status: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDueCount: number;
  liveError: string | null;
  oauthEnabled: boolean;
}

const COPY: Record<ConnectStatus, { title: string; text: string }> = {
  NOT_CONNECTED: {
    title: "Get paid by your clients",
    text: "Connect a Stripe account to sell programs and monthly coaching. Clients pay you directly and payouts go to your bank. MIA takes no commission; Stripe's standard processing fees apply.",
  },
  ONBOARDING: {
    title: "Finish setting up Stripe",
    text: "Stripe needs a few more details before you can take payments. It takes about five minutes.",
  },
  RESTRICTED: {
    title: "Stripe needs more information",
    text: "Your details are submitted, but Stripe needs something else before payments can resume.",
  },
  ACTIVE: {
    title: "You're ready to take payments",
    text: "Clients can buy your offers from their Store. Manage refunds, disputes and your bank account in Stripe.",
  },
  DISCONNECTED: {
    title: "Stripe is disconnected",
    text: "Your offers are hidden from clients. If MIA's access to that Stripe account was revoked, its memberships were ended in MIA and their programs paused; any subscriptions still running there must be canceled in your Stripe Dashboard.",
  },
};

function Flag({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <span className="inline-flex items-center gap-1.5 text-label">
      <Icon className={cn("size-4", ok ? ROLE_CLASSES.success.text : "text-muted-foreground")} aria-hidden />
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </span>
  );
}

export function ConnectStatusCard({
  status,
  chargesEnabled,
  payoutsEnabled,
  requirementsDueCount,
  liveError,
  oauthEnabled,
}: ConnectStatusCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"onboard" | "oauth" | "disconnect" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const badge = badgeFor(CONNECT_STATUS_BADGE, status);
  const copy = COPY[status];
  const connected = status !== "NOT_CONNECTED" && status !== "DISCONNECTED";

  async function redirectWith(kind: "onboard" | "oauth") {
    if (busy) return;
    setBusy(kind);
    const result = kind === "onboard" ? await startConnectOnboardingAction() : await startConnectOAuthAction();
    if (!result.success) {
      toast.error(result.error);
      setBusy(null);
      return;
    }
    // Stays busy: the page is navigating to Stripe.
    window.location.href = result.data.url;
  }

  async function disconnect() {
    setConfirmOpen(false);
    setBusy("disconnect");
    const result = await disconnectConnectedAccountAction();
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Stripe disconnected");
    router.refresh();
  }

  const onboardLabel =
    status === "NOT_CONNECTED" || status === "DISCONNECTED"
      ? "Set up payments with Stripe"
      : "Continue in Stripe";

  return (
    <SectionCard
      title="Stripe account"
      icon={Landmark}
      action={<StatusBadge status={status} label={badge.label} role={badge.role} />}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-heading text-foreground">{copy.title}</p>
          <p className="max-w-2xl text-body text-muted-foreground">{copy.text}</p>
        </div>

        {connected && (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Flag ok={chargesEnabled} label={chargesEnabled ? "Payments enabled" : "Payments not enabled yet"} />
            <Flag ok={payoutsEnabled} label={payoutsEnabled ? "Payouts enabled" : "Payouts not enabled yet"} />
            {requirementsDueCount > 0 && (
              <Flag ok={false} label={`${requirementsDueCount} item${requirementsDueCount === 1 ? "" : "s"} due in Stripe`} />
            )}
          </div>
        )}

        {liveError && <p className="text-caption">{liveError} Showing the last known status.</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {status !== "ACTIVE" && (
            <Button className="h-11 sm:h-9" onClick={() => redirectWith("onboard")} disabled={busy !== null}>
              {busy === "onboard" ? "Opening Stripe…" : onboardLabel}
            </Button>
          )}
          {oauthEnabled && !connected && (
            <Button
              variant="outline"
              className="h-11 sm:h-9"
              onClick={() => redirectWith("oauth")}
              disabled={busy !== null}
            >
              <Link2 aria-hidden />
              {busy === "oauth" ? "Opening Stripe…" : "Connect an existing Stripe account"}
            </Button>
          )}
          {connected && (
            <Button variant="outline" className="h-11 sm:h-9" asChild>
              <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                Open Stripe Dashboard
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          )}
          {connected && (
            <Button
              variant="ghost"
              className="h-11 text-muted-foreground sm:h-9"
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null}
            >
              <Unplug aria-hidden />
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Disconnect Stripe?"
        description="Your offers will be hidden from clients right away. If MIA's access to your Stripe account is revoked, active memberships are ended in MIA and their programs paused, but the subscriptions themselves keep running in Stripe until you cancel them in your Stripe Dashboard."
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={disconnect}
      />
    </SectionCard>
  );
}
