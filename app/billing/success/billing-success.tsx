"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

/** Synced: ACTIVE, or trialing on a real Stripe subscription (card-required trial). */
function isSubscribed(sub?: { status: string; stripeSubscriptionId?: string | null }): boolean {
  if (!sub) return false;
  return sub.status === "ACTIVE" || (sub.status === "TRIALING" && Boolean(sub.stripeSubscriptionId));
}

export function BillingSuccess() {
  const router = useRouter();
  const params = useSearchParams();
  const isCoaching = params.get("coaching") === "1";
  const sessionId = params.get("session_id");
  const attempts = useRef(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      attempts.current += 1;
      try {
        const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
        const res = await fetch(`/api/stripe/status${query}`);
        const data = await res.json() as {
          subscription?: { status: string; stripeSubscriptionId?: string | null };
          coaching?: { status: string } | null;
        };
        if (
          (isCoaching
            ? data.coaching?.status === "ACTIVE"
            : isSubscribed(data.subscription)) ||
          attempts.current >= 10
        ) {
          clearInterval(poll);
          router.push("/dashboard");
        }
      } catch {
        if (attempts.current >= 10) {
          clearInterval(poll);
          router.push("/dashboard");
        }
      }
    }, 1000);

    return () => clearInterval(poll);
  }, [router, isCoaching, sessionId]);

  return (
    <div role="status" className="flex flex-col items-start gap-4">
      <div className="flex size-14 items-center justify-center rounded-full bg-success-soft">
        <Check className="size-7 text-success" aria-hidden />
      </div>
      <h2 className="text-title text-foreground">
        {isCoaching ? "Coaching is starting" : "You\u2019re all set!"}
      </h2>
      <p className="flex items-center gap-2 text-body text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {isCoaching
          ? "Your coaching is being set up. Redirecting to dashboard…"
          : "Your subscription is set up. Redirecting to dashboard…"}
      </p>
    </div>
  );
}
