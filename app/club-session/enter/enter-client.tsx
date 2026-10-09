"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FAILED = "This club link has expired or was already used. Go back and click Manage club again.";

export function EnterClubSession({ ticket }: { ticket: string | null }) {
  // v7 signal API (see app/p/[slug]/success/claim-account.tsx): ticket
  // sign-in is `signIn.ticket()`, then `signIn.finalize()` sets it active.
  const { signIn } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const [error, setError] = useState<string | null>(ticket ? null : FAILED);
  // One-shot guards: the ticket is single-use and StrictMode double-invokes
  // effects. Phase 1 signs the admin out; phase 2 (a later render, once Clerk
  // reports signed out) redeems the ticket with the fresh signIn resource.
  const signOutStarted = useRef(false);
  const ticketStarted = useRef(false);

  useEffect(() => {
    // Once the ticket is in flight the next signed-in state is the house
    // coach's own session, which must not be signed out.
    if (!ticket || !isLoaded || error || ticketStarted.current) return;

    if (isSignedIn) {
      if (signOutStarted.current) return;
      signOutStarted.current = true;
      // Clerk rejects signIn.ticket() with "session_exists" while a session is
      // active. Passing a callback is SignOut's non-navigating form: clerk-js
      // runs the callback instead of navigating to the after-sign-out URL, so
      // this page stays mounted and phase 2 runs on the next render.
      clerk.signOut(() => {}).catch(() => setError(FAILED));
      return;
    }

    if (!signIn) return;
    ticketStarted.current = true;
    (async () => {
      try {
        const res = await signIn.ticket({ ticket });
        if (res.error) return setError(FAILED);
        const fin = await signIn.finalize();
        if (fin.error) return setError(FAILED);
        router.replace("/dashboard");
      } catch {
        setError(FAILED);
      }
    })();
  }, [ticket, isLoaded, isSignedIn, signIn, clerk, router, error]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-6">
        <p className="text-body text-muted-foreground">{error}</p>
        <Button asChild variant="outline">
          <Link href="/admin/clubs">Back to clubs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <Loader2 className="size-5 animate-spin text-primary" />
      <p className="text-body">Signing you in as the club&apos;s coach…</p>
    </div>
  );
}
