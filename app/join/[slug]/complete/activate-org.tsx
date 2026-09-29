"use client";

import { useEffect } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

/**
 * Makes the club the session's active org (so `auth().orgId` matches, like an
 * invited client) and moves on to client onboarding.
 */
export function ActivateOrg({ organizationId }: { organizationId: string }) {
  const { isLoaded, setActive } = useOrganizationList();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    setActive({ organization: organizationId })
      .catch((err) => console.error("setActive failed:", err))
      .finally(() => router.replace("/onboarding/client"));
  }, [isLoaded, setActive, organizationId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Setting up your account…
    </div>
  );
}
