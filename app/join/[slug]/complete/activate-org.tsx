"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
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
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center gap-2 bg-surface text-body text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      Setting up your account…
    </div>
  );
}
