"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteOwnAccountAction } from "@/actions/account-actions";
import { DELETE_CONFIRMATION_PHRASE } from "@/lib/constants/account";
import type { DeletionBlocker } from "@/lib/services/user-deletion.service";

interface DeleteAccountSectionProps {
  role: "TRAINER" | "CLIENT";
}

/** Where the user lands once their account is gone. */
const ACCOUNT_DELETED_URL = "/account-deleted";
/**
 * Cap on how long we wait for Clerk's sign-out before navigating anyway. By
 * the time this runs, `deleteOwnAccountAction` has already succeeded — the
 * account and its data are gone server-side — so a stalled network call to
 * Clerk (a phone on bad signal is exactly this case) must never leave the
 * user stuck looking at a "Deleting…" dialog they cannot even cancel.
 */
const SIGN_OUT_TIMEOUT_MS = 4000;

/**
 * Runs after account deletion has already succeeded, so there is nothing
 * left to wait for. Always calls `navigate`, whatever `signOut` does:
 * resolves, rejects, or hangs past `timeoutMs`. Exported for direct unit
 * testing since this repo has no jsdom/testing-library to drive the dialog's
 * click handlers.
 */
export async function finishAccountDeletion({
  signOut,
  navigate,
  timeoutMs = SIGN_OUT_TIMEOUT_MS,
}: {
  signOut: () => Promise<unknown>;
  navigate: () => void;
  timeoutMs?: number;
}): Promise<void> {
  try {
    await Promise.race([
      signOut(),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // The Clerk user may already be gone; the session is invalid either way.
  }
  // The account is deleted regardless of how sign-out went, so always leave.
  navigate();
}

/** Settings danger zone (mobile spec §6). Works on web and inside the native shell. */
export function DeleteAccountSection({ role }: DeleteAccountSectionProps) {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [pending, startTransition] = useTransition();

  const canSubmit = confirmation.trim() === DELETE_CONFIRMATION_PHRASE && !pending;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteOwnAccountAction({ confirmation });
      if (!result.success) {
        setBlockers(result.blockers ?? []);
        toast.error(result.error);
        return;
      }
      await finishAccountDeletion({
        signOut: () => signOut({ redirectUrl: ACCOUNT_DELETED_URL }),
        navigate: () => window.location.assign(ACCOUNT_DELETED_URL),
      });
    });
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently removes your profile, health and fitness records, messages, and
          notification devices. This cannot be undone.
          {role === "TRAINER" && (
            <> If you are your organization&apos;s only active trainer, deactivate or
            reassign its active clients first.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>

        <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setConfirmation(""); setBlockers([]); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Type <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRMATION_PHRASE}</span> to
                confirm. Everything you have logged and every message you have sent will be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Input
              autoFocus
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={DELETE_CONFIRMATION_PHRASE}
              aria-label={`Type ${DELETE_CONFIRMATION_PHRASE} to confirm`}
              autoCapitalize="characters"
              autoComplete="off"
            />

            {blockers.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning-foreground">
                {blockers.map((b) => (
                  <li key={b.code}>
                    {b.message.charAt(0).toUpperCase() + b.message.slice(1)}
                    {b.code === "ACTIVE_CLIENTS" && (
                      <>
                        {" "}
                        <Link href="/clients" className="underline" onClick={() => setOpen(false)}>
                          Go to clients
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDelete} disabled={!canSubmit}>
                {pending ? "Deleting…" : "Delete account"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
