"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";
import { Check } from "lucide-react";

export function PricingCards() {
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
    <div className="grid gap-6 md:grid-cols-3 pt-5 items-stretch">
      {tiers.map((tier) => {
        const config = TIER_CONFIG[tier];
        const isPopular = tier === "PRO";
        return (
          <div key={tier} className="relative flex flex-col">
            {isPopular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow">
                  Most Popular
                </span>
              </div>
            )}
            <Card
              className={`flex flex-col flex-1${isPopular ? " ring-2 ring-primary shadow-lg" : ""}`}
            >
              <CardHeader className="pt-8">
                <CardTitle className="text-xl">{config.label}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold">
                    ${config.priceInCents / 100}
                  </span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 space-y-4">
                <ul className="space-y-2 flex-1">
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    {config.description}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    AI workout generation
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    Client progress tracking
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    Assessments &amp; check-ins
                  </li>
                </ul>
                <Button
                  className="w-full mt-auto"
                  onClick={() => handleSelectPlan(tier)}
                  disabled={loading !== null}
                  variant={isPopular ? "default" : "outline"}
                >
                  {loading === tier ? "Redirecting…" : "Start Plan"}
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
