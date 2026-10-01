"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function BuyButton({
  slug,
  bundle,
}: {
  slug: string;
  bundle: { name: string; price: string; description: string } | null;
}) {
  const [withBundle, setWithBundle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, withBundle }),
      });
      if (!res.ok) throw new Error("Checkout failed");
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setLoading(false);
      setError("Something went wrong starting checkout. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {bundle && (
        <Label
          htmlFor="bundle-checkbox"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-4 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
        >
          <Checkbox
            id="bundle-checkbox"
            checked={withBundle}
            onCheckedChange={(checked) => setWithBundle(checked)}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              Add {bundle.name} — ${bundle.price}
            </span>
            {bundle.description && (
              <span className="text-sm text-muted-foreground">{bundle.description}</span>
            )}
          </span>
        </Label>
      )}
      <Button onClick={handleBuy} disabled={loading} size="lg" className="h-11 w-full">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? "Starting checkout…" : "Buy Now"}
      </Button>
      {error && <p className="text-body text-danger-foreground" role="alert">{error}</p>}
    </div>
  );
}
