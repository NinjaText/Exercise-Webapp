"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { RequestCoachingDialog } from "@/components/dashboard/request-coaching-dialog";
import { withdrawCoachingRequestAction } from "@/actions/coaching-actions";
import type { CoachingViewModel } from "@/lib/clubs/coaching-view";

/** POSTs to a Stripe-redirect endpoint; resolves with the URL, or throws. */
async function postForUrl(endpoint: string): Promise<string> {
  const res = await fetch(endpoint, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { url: string | null };
  if (!data.url) throw new Error("No URL returned");
  return data.url;
}

export function CoachingCard({ coaching, className }: { coaching: CoachingViewModel; className?: string }) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState<"checkout" | "portal" | null>(null);
  const [withdrawing, startWithdraw] = useTransition();
  const { status, priceLabel } = coaching;
  // Stays set after a successful POST: the page is navigating away, so the button must not re-enable.
  const busy = redirecting !== null || withdrawing;

  async function redirectTo(kind: "checkout" | "portal", endpoint: string) {
    if (busy) return;
    setRedirecting(kind);
    try {
      window.location.href = await postForUrl(endpoint);
    } catch {
      toast.error("Something went wrong. Please try again.");
      setRedirecting(null);
    }
  }

  function withdraw() {
    startWithdraw(async () => {
      const res = await withdrawCoachingRequestAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const withdrawButton = (
    <Button variant="outline" onClick={withdraw} disabled={busy}>
      {withdrawing ? "Withdrawing…" : "Withdraw"}
    </Button>
  );

  let badge: React.ReactNode = null;
  let body: React.ReactNode;
  switch (status) {
    case "REQUESTED":
      badge = <StatusBadge status="REQUESTED" role="info" label="Request sent" />;
      body = (
        <>
          <p className="text-sm text-muted-foreground">
            Your coach will review your request. You&apos;ll be notified when they respond.
          </p>
          {withdrawButton}
        </>
      );
      break;
    case "ACCEPTED":
      badge = <StatusBadge status="ACCEPTED" role="success" label="Accepted" />;
      body = (
        <>
          <p className="text-sm text-muted-foreground">
            Your coach accepted{priceLabel ? `, start coaching for ${priceLabel}` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => redirectTo("checkout", "/api/checkout/coaching")} disabled={busy}>
              {redirecting === "checkout" ? "Redirecting…" : "Start coaching"}
            </Button>
            {withdrawButton}
          </div>
        </>
      );
      break;
    case "ACTIVE":
      badge = <StatusBadge status="ACTIVE" role="success" label="Active" />;
      body = (
        <>
          <p className="text-sm text-muted-foreground">Coaching is active.</p>
          <Button asChild>
            <Link href="/messages">Message your coach</Link>
          </Button>
        </>
      );
      break;
    case "PAST_DUE":
      badge = <StatusBadge status="PAST_DUE" role="warning" label="Paused" />;
      body = (
        <>
          <p className="text-sm text-muted-foreground">Coaching is paused until your payment is updated.</p>
          <Button onClick={() => redirectTo("portal", "/api/stripe/member-portal")} disabled={busy}>
            {redirecting === "portal" ? "Redirecting…" : "Update payment"}
          </Button>
        </>
      );
      break;
    default:
      // none / DECLINED / CANCELED
      body = (
        <>
          <p className="text-sm text-muted-foreground">
            {status === "DECLINED"
              ? "Your last request wasn't accepted. You can send a new one."
              : `Work one-on-one with your club coach${priceLabel ? ` for ${priceLabel}` : ""}.`}
          </p>
          <RequestCoachingDialog />
        </>
      );
  }

  return (
    <SectionCard title="Coaching" icon={HeartHandshake} action={badge} className={className}>
      <div className="flex flex-col items-start gap-3">{body}</div>
    </SectionCard>
  );
}
