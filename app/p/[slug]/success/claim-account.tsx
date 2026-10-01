"use client";

import { useEffect, useRef, useState } from "react";
import { useSignIn, useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markProgramPurchaseClaimedAction } from "@/actions/program-purchase-actions";

export function ClaimAccount({
  ticket,
  buyerEmail,
  sessionId,
}: {
  ticket: string;
  buyerEmail: string;
  sessionId: string;
}) {
  // @clerk/nextjs v7 useSignIn is the signal-based hook: `signIn` is a
  // SignInFutureResource. Ticket sign-in is `signIn.ticket(...)`, then
  // `signIn.finalize()` promotes the new session to the active session.
  const { signIn } = useSignIn();
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    // Wait until Clerk auth + user state are known so we can detect a
    // pre-existing session before attempting the (single-use) ticket sign-in.
    if (!signIn || signedIn || !authLoaded || !userLoaded) return;
    // One-shot guard: the ticket is single-use and React StrictMode (dev)
    // double-invokes effects. The ref ensures ticket()/finalize() run exactly
    // once. We deliberately do NOT use a `cancelled` cleanup flag — combined
    // with the ref guard it would discard the only run that executes and leave
    // the component stuck on "Signing you in…".
    if (attempted.current) return;
    attempted.current = true;
    (async () => {
      try {
        // Clerk rejects signIn.ticket() with "session_exists" if a session is
        // already active. Handle the two ways that can happen.
        if (isSignedIn) {
          const currentEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
          if (currentEmail === buyerEmail.toLowerCase()) {
            router.push("/dashboard");
          } else {
            setError("You're signed in with a different account. Please sign out, then reopen this link.");
          }
          return;
        }
        const res = await signIn.ticket({ ticket });
        if (res.error) {
          setError("This link just expired. Refresh the page for a new one, or sign in.");
          return;
        }
        const fin = await signIn.finalize();
        if (fin.error) {
          setError("We couldn't finish signing you in. Refresh the page, or sign in.");
          return;
        }
        setSignedIn(true);
      } catch {
        setError("We couldn't finish signing you in. Refresh the page, or sign in.");
      }
    })();
  }, [signIn, ticket, signedIn, authLoaded, userLoaded, isSignedIn, user, buyerEmail, router]);

  async function handleSave() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      await user.updatePassword({ newPassword: password });
      // Only NOW is the purchase truly claimed — this is what permanently
      // stops the success page from reissuing sign-in tokens.
      await markProgramPurchaseClaimedAction(sessionId);
      router.push("/dashboard");
    } catch {
      setError("Could not set password. Please try again.");
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Card className="gap-6 py-6 shadow-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <a href="/sign-in">Sign in instead</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!signedIn || !userLoaded || !user) {
    return (
      <Card className="gap-6 py-6 shadow-md">
        <CardHeader className="items-center text-center">
          <Loader2 className="mb-2 size-8 animate-spin text-primary" />
          <CardTitle>Signing you in…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="gap-6 py-6 shadow-md">
      <CardHeader>
        <CardTitle>Create your password</CardTitle>
        <CardDescription>You&apos;re almost in — set a password to access your program.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <Label htmlFor="claim-password">Password</Label>
        <Input
          id="claim-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Saving…" : "Go to my program"}
        </Button>
      </CardFooter>
    </Card>
  );
}
