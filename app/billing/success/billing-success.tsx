"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export function BillingSuccess() {
  const router = useRouter();
  const isCoaching = useSearchParams().get("coaching") === "1";
  const attempts = useRef(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      attempts.current += 1;
      try {
        const res = await fetch("/api/stripe/status");
        const data = await res.json() as {
          subscription?: { status: string };
          coaching?: { status: string } | null;
        };
        if (
          (isCoaching
            ? data.coaching?.status === "ACTIVE"
            : data.subscription?.status === "ACTIVE") ||
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
  }, [router, isCoaching]);

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
          : "Your subscription is now active. Redirecting to dashboard…"}
      </p>
    </div>
  );
}
