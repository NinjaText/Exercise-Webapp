"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { enterClubAction } from "@/actions/admin-club-session-actions";

/** Opens the club as its house coach. `compact` is the list-row variant. */
export function ManageClubButton({ clerkOrgId, compact = false }: { clerkOrgId: string; compact?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () =>
    startTransition(async () => {
      setError(null);
      let res: Awaited<ReturnType<typeof enterClubAction>>;
      try {
        res = await enterClubAction(clerkOrgId);
      } catch {
        setError("Couldn't open the club. Please try again.");
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.assign(res.url);
    });

  return (
    <div className={compact ? "relative z-10 flex flex-col items-end gap-1" : "flex flex-col items-start gap-1"}>
      <Button
        type="button"
        size={compact ? "sm" : "default"}
        variant={compact ? "outline" : "default"}
        disabled={pending}
        onClick={(e) => {
          // Inside a clickable list row: don't also navigate to the detail page.
          e.stopPropagation();
          open();
        }}
      >
        {pending ? "Opening…" : compact ? "Manage" : "Manage club"}
      </Button>
      {error && (
        <p role="alert" className="text-caption text-danger-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
