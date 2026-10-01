"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Action = "subscribe" | "manage";

const ENDPOINTS: Record<Action, string> = {
  subscribe: "/api/checkout/member",
  manage: "/api/stripe/member-portal",
};

export function MemberBillingButtons({
  canSubscribe, canManage, missingPrice,
}: { canSubscribe: boolean; canManage: boolean; missingPrice: boolean }) {
  const [loading, setLoading] = useState<Action | null>(null);

  async function go(action: Action) {
    setLoading(action);
    try {
      const res = await fetch(ENDPOINTS[action], { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { url: string | null };
      if (!data.url) throw new Error("No URL returned");
      window.location.href = data.url;
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canSubscribe && (
        <Button size="lg" className="h-11 w-full" disabled={loading !== null} onClick={() => go("subscribe")}>
          {loading === "subscribe" ? "Redirecting…" : "Subscribe"}
        </Button>
      )}
      {canManage && (
        <Button variant="outline" size="lg" className="h-11 w-full" disabled={loading !== null} onClick={() => go("manage")}>
          {loading === "manage" ? "Redirecting…" : "Manage billing"}
        </Button>
      )}
      {missingPrice && (
        <p className="text-body text-muted-foreground">
          Subscriptions aren&apos;t set up for this club yet — contact support.
        </p>
      )}
    </div>
  );
}
