"use client";

import { useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import type { ExternalAccountResource } from "@clerk/nextjs/types";
import { toast } from "sonner";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SettingsPanel } from "@/components/settings/settings-section";
import { clerkErrorMessage, isCancelledReverification } from "@/components/settings/account/clerk-error";

function providerName(provider: string): string {
  const name = provider.replace(/^oauth_/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Lists sign-in providers linked to the account. Hidden when there are none. */
export function ConnectedAccountsPanel() {
  const { user } = useUser();
  const [disconnecting, setDisconnecting] = useState<ExternalAccountResource | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const destroyAccount = useReverification((account: ExternalAccountResource) => account.destroy());

  if (!user || user.externalAccounts.length === 0) return null;

  // Removing the only way in would lock the user out.
  const isLastSignInMethod = !user.passwordEnabled && user.externalAccounts.length === 1;

  async function handleDisconnect(account: ExternalAccountResource) {
    setBusy(account.id);
    try {
      await destroyAccount(account);
      await user!.reload();
      toast.success(`${providerName(account.provider)} disconnected`);
    } catch (error) {
      if (!isCancelledReverification(error)) {
        toast.error(clerkErrorMessage(error, "We couldn't disconnect that account."));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsPanel
      title="Connected accounts"
      description="Accounts you can use to sign in with one click."
    >
      <ul className="flex flex-col divide-y divide-border rounded-lg ring-1 ring-border">
        {user.externalAccounts.map((account) => (
          <li key={account.id} className="flex items-center gap-4 px-4 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {account.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- provider avatar from Clerk's CDN
                <img src={account.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <Link2 className="size-4 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{providerName(account.provider)}</p>
              <p className="truncate text-xs text-muted-foreground">{account.emailAddress || account.username}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisconnecting(account)}
              disabled={busy !== null || isLastSignInMethod}
              title={isLastSignInMethod ? "Set a password first so you can still sign in" : undefined}
            >
              {busy === account.id && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Disconnect
            </Button>
          </li>
        ))}
      </ul>
      {isLastSignInMethod && (
        <p className="text-xs text-muted-foreground">
          This is your only way to sign in. Set a password below before disconnecting it.
        </p>
      )}

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title={`Disconnect ${disconnecting ? providerName(disconnecting.provider) : ""}?`}
        description="You won't be able to sign in with this account anymore."
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={() => {
          if (disconnecting) handleDisconnect(disconnecting);
          setDisconnecting(null);
        }}
      />
    </SettingsPanel>
  );
}
