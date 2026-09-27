import Link from "next/link";
import type { Metadata } from "next";
import { clerkClient } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { brandIconsMetadata } from "@/lib/branding/metadata";
import { getPurchaseBySessionId } from "@/lib/services/program-purchase.service";
import { ClaimAccount } from "./claim-account";
import { PendingStatus } from "./pending-status";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}): Promise<Metadata> {
  const { session_id } = await searchParams;
  const purchase = session_id ? await getPurchaseBySessionId(session_id) : null;
  const branding = await getOrgBranding(purchase?.orgId ?? null);
  return {
    // `absolute`: no app/p layout, so a plain string would get the root
    // "%s | INMOTUS RX" template appended after the org name.
    title: { absolute: `Payment successful | ${branding.displayName}` },
    ...brandIconsMetadata(branding),
  };
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let purchaseFound = false;
  let claimed = false;
  let ticket: string | null = null;
  let buyerEmail: string | null = null;
  let orgId: string | null = null;

  if (session_id) {
    const purchase = await getPurchaseBySessionId(session_id);
    if (purchase) {
      purchaseFound = true;
      orgId = purchase.orgId;
      if (purchase.status === "COMPLETED" && purchase.buyerClerkId) {
        if (purchase.accountClaimedAt) {
          claimed = true;
        } else {
          // Mint a fresh sign-in token on every load until the buyer actually
          // finishes setting their password. Reloading (or a browser firing a
          // duplicate request for the same navigation, which does happen) is
          // always safe: Clerk's token is single-use and expires in 30
          // minutes on its own, and markProgramPurchaseClaimedAction — called
          // only once the password is truly set — is what permanently locks
          // this page down. Gating re-issuance on "was a token ever handed
          // out" instead of "did the buyer actually finish" was the earlier
          // bug: a stray duplicate request could win the only token and leave
          // the buyer stuck on "already set up" without ever finishing setup.
          try {
            const clerk = await clerkClient();
            const token = await clerk.signInTokens.createSignInToken({
              userId: purchase.buyerClerkId,
              expiresInSeconds: 60 * 30,
            });
            ticket = token.token;
            buyerEmail = purchase.buyerEmail;
          } catch (err) {
            console.error("createSignInToken failed", err);
          }
        }
      }
    }
  }

  const isPending = purchaseFound && !claimed && !ticket;

  const branding = await getOrgBranding(orgId);
  const brandingVm = toViewModel(branding);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-muted to-info-soft px-4 py-12">
      <BrandStyle branding={branding} />
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <OrgIdentity branding={brandingVm} surface="light" />
        </div>
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Payment successful 🎉</h1>
          <p className="mt-1 text-muted-foreground">
            {claimed ? "Your account is ready." : "Let's get your program set up."}
          </p>
        </div>

        {!purchaseFound && (
          <Card>
            <CardHeader>
              <CardTitle>We couldn&apos;t find that purchase</CardTitle>
              <CardDescription>
                If you just completed a payment, please check your email for a login link, or sign in below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {purchaseFound && claimed && (
          <Card>
            <CardHeader>
              <CardTitle>This account is already set up</CardTitle>
              <CardDescription>Sign in to access your program.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isPending && <PendingStatus />}

        {ticket && buyerEmail && session_id && (
          <ClaimAccount ticket={ticket} buyerEmail={buyerEmail} sessionId={session_id} />
        )}
      </div>
    </div>
  );
}
