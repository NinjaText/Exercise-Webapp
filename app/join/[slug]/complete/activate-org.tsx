"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

/**
 * Makes the club the session's active org (so `auth().orgId` matches, like an
 * invited client) and moves on to client onboarding (or, for a card-required
 * club, to membership checkout).
 */
export function ActivateOrg({ organizationId, next = "/onboarding/client" }: { organizationId: string; next?: string }) {
  const { isLoaded, setActive } = useOrganizationList();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    setActive({ organization: organizationId })
      .catch((err) => console.error("setActive failed:", err))
      .finally(() => {
        // The checkout step is a route handler that redirects to Stripe: a
        // full navigation, not a client-side transition.
        if (next.endsWith("/checkout")) window.location.assign(next);
        else router.replace(next);
      });
  }, [isLoaded, setActive, organizationId, router, next]);

  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center gap-2 bg-surface text-body text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      Setting up your account…
    </div>
  );
}
