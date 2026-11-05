"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/billing/plan-card";
import { TIER_CONFIG, TRAINER_TRIAL_DAYS, VALID_TIERS, formatTierPrice, type PlanTier } from "@/lib/stripe-config";

const CLIENT_RANGE: Record<PlanTier, string> = {
  STARTER: "1–10 active clients",
  PRO: "11–30 active clients",
  UNLIMITED: "31–150 active clients",
};

export function PricingCards({
  headingLevel = 2,
  trialEligible = false,
  highlightPlan,
}: {
  headingLevel?: 2 | 3 | 4;
  /** Never trialed: CTAs read "Start 7-day free trial" (card required, billed after). */
  trialEligible?: boolean;
  /** Plan picked on the marketing site; emphasised instead of the default. */
  highlightPlan?: PlanTier | null;
} = {}) {
  const [loading, setLoading] = useState<PlanTier | null>(null);

  async function handleSelectPlan(tier: PlanTier) {
    setLoading(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Failed to create checkout session");
      const data = await res.json() as { url: string | null };
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  const emphasised = highlightPlan ?? "PRO";

  return (
    <div className="grid items-stretch gap-6 md:grid-cols-3">
      {VALID_TIERS.map((tier) => {
        const config = TIER_CONFIG[tier];
        const isHighlighted = tier === emphasised;
        return (
          <PlanCard
            key={tier}
            name={config.label}
            price={formatTierPrice(config.priceInCents)}
            cadence="/ month"
            billedNote={
              trialEligible
                ? `${TRAINER_TRIAL_DAYS}-day free trial, then billed monthly`
                : "Billed monthly"
            }
            badge={tier === "PRO" ? "Most popular" : undefined}
            highlighted={isHighlighted}
            headingLevel={headingLevel}
            features={[
              CLIENT_RANGE[tier],
              "AI workout generation",
              "Client progress tracking",
              "Assessments & check-ins",
            ]}
          >
            <Button
              size="lg"
              className="h-11 w-full"
              onClick={() => handleSelectPlan(tier)}
              disabled={loading !== null}
              variant={isHighlighted ? "default" : "outline"}
            >
              {loading === tier
                ? "Redirecting…"
                : trialEligible
                  ? `Start free trial on ${config.label}`
                  : `Choose ${config.label}`}
            </Button>
          </PlanCard>
        );
      })}
    </div>
  );
}
