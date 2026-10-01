"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the Stripe customer portal, where plan, payment method and invoices are managed. */
export function ManageSubscriptionButton({ label = "Manage subscription" }: { label?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) throw new Error("Portal request failed");
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setLoading(false);
      toast.error("We couldn't open the billing portal. Please try again.");
    }
  }

  return (
    <Button onClick={handleManage} disabled={loading} variant="outline">
      {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ExternalLink className="mr-2 size-4" />}
      {loading ? "Opening…" : label}
    </Button>
  );
}
