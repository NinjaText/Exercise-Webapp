"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runReferralSweepAction } from "./actions";

/** Runs the daily referral sweep now (Stripe payment backfill, churn, retention, bonuses). */
export function RecalculateButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await runReferralSweepAction();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          const r = res.data!;
          const changes = [
            r.backfilledPayments && `${r.backfilledPayments} payment${r.backfilledPayments === 1 ? "" : "s"} recovered`,
            r.retained && `${r.retained} newly retained`,
            r.bonusesAwarded && `${r.bonusesAwarded} bonus${r.bonusesAwarded === 1 ? "" : "es"} earned`,
            r.churned && `${r.churned} churned`,
          ].filter(Boolean);
          toast.success(changes.length ? changes.join(" · ") : "Everything is up to date");
          if (r.errors) toast.warning(`${r.errors} check${r.errors === 1 ? "" : "s"} couldn't reach Stripe — retried in the daily run.`);
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
      {pending ? "Checking Stripe…" : "Recalculate now"}
    </Button>
  );
}
