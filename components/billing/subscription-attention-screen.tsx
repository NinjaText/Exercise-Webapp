import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export type AttentionReason = "trial_expired" | "payment_failed" | "manage";

const HEADLINE: Record<AttentionReason, string> = {
  trial_expired: "Your subscription needs attention",
  payment_failed: "Your subscription needs attention",
  manage: "Subscription",
};

const REASON_TEXT: Record<AttentionReason, string> = {
  trial_expired: "Your free trial has ended.",
  payment_failed: "There's a problem with your last subscription payment.",
  manage: "",
};

/**
 * Shown inside the native shell instead of any pricing or checkout UI.
 * Apple 3.1.1: no prices, no purchase buttons, and no links or directions to
 * a payment page — only a neutral statement and a way to sign out.
 */
export function SubscriptionAttentionScreen({
  reason,
  layout = "page",
}: {
  reason: AttentionReason;
  layout?: "page" | "inline";
}) {
  const Headline = layout === "inline" ? "h2" : "h1";
  const body = (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
      <div className="size-12 rounded-full bg-muted" aria-hidden />
      <Headline className="text-xl font-semibold text-foreground">{HEADLINE[reason]}</Headline>
      <p className="text-sm text-muted-foreground">
        {REASON_TEXT[reason] ? `${REASON_TEXT[reason]} ` : ""}
        Your subscription is managed from your account on the web.
      </p>
      <SignOutButton>
        <Button variant="outline">Sign out</Button>
      </SignOutButton>
    </div>
  );
  if (layout === "inline") return body;
  return <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">{body}</div>;
}
