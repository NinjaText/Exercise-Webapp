"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";
import { format } from "date-fns";

interface SubscriptionStatusProps {
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export function SubscriptionStatus({
  plan,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: SubscriptionStatusProps) {
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) throw new Error("Portal request failed");
      const data = await res.json() as { url: string };
      window.location.href = data.url;
    } catch {
      setLoading(false);
    }
  }

  const tierLabel =
    TIER_CONFIG[plan as PlanTier]?.label ?? plan;

  return (
    <SectionCard title="Current plan">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{tierLabel}</span>
          <StatusBadge status={status} size="sm" />
        </div>
        {currentPeriodEnd && (
          <p className="text-sm text-muted-foreground">
            Next billing date:{" "}
            {format(new Date(currentPeriodEnd), "MMMM d, yyyy")}
          </p>
        )}
        {cancelAtPeriodEnd && (
          <p className="text-sm text-warning-foreground">
            Your subscription will cancel at the end of the current billing
            period.
          </p>
        )}
        <Button onClick={handleManage} disabled={loading} variant="outline">
          {loading ? "Redirecting…" : "Manage Subscription"}
        </Button>
      </div>
    </SectionCard>
  );
}
