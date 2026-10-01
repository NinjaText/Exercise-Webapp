"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useReverification, useUser } from "@clerk/nextjs";
import type { EmailAddressResource } from "@clerk/nextjs/types";
import { toast } from "sonner";
import { Loader2, Mail, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/shared/form-section";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingsPanel } from "@/components/settings/settings-section";
import { syncMyClerkProfileAction } from "@/actions/profile-actions";
import { clerkErrorMessage, isCancelledReverification } from "@/components/settings/account/clerk-error";
import { PanelSkeleton } from "@/components/settings/account/panel-skeleton";

type Step = { kind: "idle" } | { kind: "enter" } | { kind: "verify"; address: EmailAddressResource };

export function EmailPanel() {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EmailAddressResource | null>(null);

  // Clerk may ask the user to confirm it's them before these; the hook shows
  // its prompt and then retries the call.
  const createEmail = useReverification((email: string) => user!.createEmailAddress({ email }));
  const makePrimary = useReverification((id: string) => user!.update({ primaryEmailAddressId: id }));
  const destroyEmail = useReverification((address: EmailAddressResource) => address.destroy());

  if (!user) return <PanelSkeleton title="Email addresses" />;
  const addresses = [...user.emailAddresses].sort(
    (a, b) => Number(b.id === user.primaryEmailAddressId) - Number(a.id === user.primaryEmailAddressId)
  );

  async function run(key: string, fn: () => Promise<void>, fallback: string) {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      if (!isCancelledReverification(error)) toast.error(clerkErrorMessage(error, fallback));
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setStep({ kind: "idle" });
    setNewEmail("");
    setCode("");
  }

  const sendCode = (address: EmailAddressResource) =>
    run(
      "send",
      async () => {
        await address.prepareVerification({ strategy: "email_code" });
        setCode("");
        setStep({ kind: "verify", address });
        toast.success(`We sent a code to ${address.emailAddress}`);
      },
      "We couldn't send a verification code."
    );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    run(
      "add",
      async () => {
        const address = await createEmail(email);
        await user.reload();
        await sendCode(address);
      },
      "We couldn't add that email."
    );
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "verify") return;
    run(
      "verify",
      async () => {
        const result = await step.address.attemptVerification({ code: code.trim() });
        if (result.verification.status !== "verified") throw new Error("not verified");
        await user.reload();
        toast.success(`${result.emailAddress} is verified`);
        reset();
      },
      "That code didn't work. Check it and try again."
    );
  };

  const handleMakePrimary = (address: EmailAddressResource) =>
    run(
      address.id,
      async () => {
        await makePrimary(address.id);
        await user.reload();
        const sync = await syncMyClerkProfileAction();
        if (!sync.success && sync.error) toast.error(sync.error);
        else toast.success(`${address.emailAddress} is now your primary email`);
        router.refresh();
      },
      "We couldn't change your primary email."
    );

  const handleRemove = (address: EmailAddressResource) =>
    run(
      address.id,
      async () => {
        await destroyEmail(address);
        await user.reload();
        toast.success(`${address.emailAddress} removed`);
      },
      "We couldn't remove that email."
    );

  return (
    <SettingsPanel
      title="Email addresses"
      description="Your primary email is where we send notifications and where you sign in. Add another address to switch to it."
    >
      <ul className="flex flex-col divide-y divide-border rounded-lg ring-1 ring-border">
        {addresses.map((address) => {
          const isPrimary = address.id === user.primaryEmailAddressId;
          const verified = address.verification.status === "verified";
          return (
            <li key={address.id} className="flex items-center gap-3 px-4 py-3">
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{address.emailAddress}</span>
              {isPrimary && <StatusBadge status="primary" label="Primary" role="brand" dot={false} size="sm" />}
              {!verified && <StatusBadge status="unverified" label="Unverified" role="warning" size="sm" />}
              {busy === address.id ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                !isPrimary && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" aria-label={`Options for ${address.emailAddress}`} />}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {verified ? (
                        <DropdownMenuItem onClick={() => handleMakePrimary(address)}>Make primary</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => sendCode(address)}>Verify</DropdownMenuItem>
                      )}
                      <DropdownMenuItem variant="destructive" onClick={() => setRemoving(address)}>
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              )}
            </li>
          );
        })}
      </ul>

      {step.kind === "idle" && (
        <Button variant="outline" className="w-fit" onClick={() => setStep({ kind: "enter" })}>
          <Plus className="mr-1.5 size-4" />
          Add email address
        </Button>
      )}

      {step.kind === "enter" && (
        <form onSubmit={handleAdd} className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4 ring-1 ring-border">
          <FormField label="New email address" htmlFor="newEmail" hint="We'll send a 6-digit code to confirm it's yours.">
            <Input
              id="newEmail"
              type="email"
              autoComplete="email"
              autoFocus
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </FormField>
          <div className="flex gap-2">
            <Button type="submit" disabled={!newEmail.trim() || busy !== null}>
              {(busy === "add" || busy === "send") && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send code
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step.kind === "verify" && (
        <form onSubmit={handleVerify} className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4 ring-1 ring-border">
          <FormField
            label="Verification code"
            htmlFor="emailCode"
            hint={`Enter the code we sent to ${step.address.emailAddress}.`}
          >
            <Input
              id="emailCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="max-w-40 font-mono tracking-[0.3em]"
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={code.length !== 6 || busy !== null}>
              {busy === "verify" && <Loader2 className="mr-2 size-4 animate-spin" />}
              Verify
            </Button>
            <Button type="button" variant="ghost" onClick={() => sendCode(step.address)} disabled={busy !== null}>
              Resend code
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this email?"
        description={`${removing?.emailAddress ?? ""} will no longer be able to sign in to your account or receive notifications.`}
        confirmLabel="Remove email"
        variant="destructive"
        onConfirm={() => {
          if (removing) handleRemove(removing);
          setRemoving(null);
        }}
      />
    </SettingsPanel>
  );
}
