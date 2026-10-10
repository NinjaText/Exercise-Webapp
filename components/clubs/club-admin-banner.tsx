"use client";

import { useCallback, useState } from "react";
import { LogOut } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { exitClubAction } from "@/actions/admin-club-session-actions";

const ADMIN_URL = "/admin";

/**
 * Ends the club session, then signs the house coach out. The sign-out runs
 * even if ending the session throws: the admin must never be stuck inside.
 */
export async function exitClubSession(deps: {
  exitAction: () => Promise<void>;
  signOut: (opts: { redirectUrl: string }) => Promise<unknown>;
}): Promise<void> {
  try {
    await deps.exitAction();
  } catch (err) {
    console.error("exitClubAction failed:", err);
  }
  await deps.signOut({ redirectUrl: ADMIN_URL });
}

function useExitClub() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const exit = useCallback(async () => {
    setPending(true);
    try {
      await exitClubSession({ exitAction: exitClubAction, signOut });
    } finally {
      setPending(false);
    }
  }, [signOut]);
  return { exit, pending };
}

/** Admin-only strip at the top of the platform shell while managing a club (spec H12). */
export function ClubAdminBanner({ clubName, adminName }: { clubName: string; adminName: string }) {
  const { exit, pending } = useExitClub();
  const adminFirstName = adminName.trim().split(/\s+/)[0] || adminName;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex shrink-0 items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground"
      style={{ paddingTop: "calc(0.5rem + var(--safe-top))" }}
    >
      <span className="min-w-0 truncate">
        Managing <strong className="font-semibold">{clubName}</strong> as {adminFirstName}
      </span>
      <button
        type="button"
        onClick={() => void exit()}
        disabled={pending}
        className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80 disabled:opacity-60"
      >
        {pending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}

/** Replaces the user menu's "Sign out" for house coaches. */
export function ExitClubButton() {
  const { exit, pending } = useExitClub();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void exit()}
      disabled={pending}
      aria-label="Exit club"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="hidden sm:inline">{pending ? "Exiting…" : "Exit club"}</span>
    </Button>
  );
}
