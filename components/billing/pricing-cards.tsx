"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/billing/plan-card";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";

export function PricingCards({ headingLevel = 2 }: { headingLevel?: 2 | 3 | 4 } = {}) {
  const [loading, setLoading] = useState<PlanTier | null>(null);

  async function handleSelectPlan(tier: PlanTier) {
    setLoading(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error("Failed to create checkout session");
      const data = await res.json() as { url: string | null };
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  }

  const tiers: PlanTier[] = ["STARTER", "PRO", "UNLIMITED"];

  return (
    <div className="grid items-stretch gap-6 md:grid-cols-3">
      {tiers.map((tier) => {
        const config = TIER_CONFIG[tier];
        const isPopular = tier === "PRO";
        return (
          <PlanCard
            key={tier}
            name={config.label}
            price={`$${config.priceInCents / 100}`}
            cadence="/ month"
            billedNote="Billed monthly"
            badge={isPopular ? "Most popular" : undefined}
            highlighted={isPopular}
            headingLevel={headingLevel}
            features={[
              config.description,
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
              variant={isPopular ? "default" : "outline"}
            >
              {loading === tier ? "Redirecting…" : "Start Plan"}
            </Button>
          </PlanCard>
        );
      })}
    </div>
  );
}
