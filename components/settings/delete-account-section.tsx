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
      try {
        await signOut({ redirectUrl: "/account-deleted" });
      } catch {
        // The Clerk user may already be gone; the session is invalid either way.
        window.location.assign("/account-deleted");
      }
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
            <> You must deactivate or reassign your active clients first.</>
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
