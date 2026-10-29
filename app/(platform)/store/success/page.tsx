import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Hourglass } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { arePaymentsAvailable } from "@/lib/payments/payments-access";
import { getPurchaseForClientBySession } from "@/lib/services/offer-purchase.service";
import { PageShell } from "@/components/shared/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshUntilReady } from "@/components/payments/refresh-until-ready";
import { cn } from "@/lib/utils";
import { ROLE_CLASSES } from "@/lib/ui/status";

export const metadata: Metadata = { title: "Payment complete" };

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

type View = { ready: boolean; title: string; text: string; cta: { label: string; href: string } };

const RECENT_MS = 60 * 60 * 1000;

async function resolveView(clientId: string, sessionId: string | undefined): Promise<View> {
  if (sessionId) {
    const purchase = await getPurchaseForClientBySession(clientId, sessionId);
    if (purchase) {
      if (purchase.status === "PAID" && purchase.fulfillmentStatus === "FULFILLED") {
        return {
          ready: true,
          title: "You're all set",
          text: `${purchase.offer.name} has been added to your programs.`,
          cta: { label: "Go to my programs", href: "/programs" },
        };
      }
      if (purchase.status === "PAID") {
        return {
          ready: false,
          title: "Setting up your program",
          text: "Payment received. We're adding the program to your account; this usually takes a few seconds.",
          cta: { label: "Back to the Store", href: "/store" },
        };
      }
      if (purchase.status === "FAILED") {
        return {
          ready: true,
          title: "Payment didn't go through",
          text: "Your payment couldn't be completed and you haven't been charged. You can try again from the Store.",
          cta: { label: "Back to the Store", href: "/store" },
        };
      }
      return {
        ready: false,
        title: "Payment processing",
        text: "Your payment is being confirmed. Some payment methods take a little longer; we'll notify your coach once it clears.",
        cta: { label: "Back to the Store", href: "/store" },
      };
    }
  }

  // Memberships have no purchase row; look for the client's newest one.
  const membership = await prisma.offerSubscription.findFirst({
    where: { clientId, createdAt: { gte: new Date(Date.now() - RECENT_MS) } },
    include: { offer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (membership?.status === "ACTIVE") {
    return {
      ready: true,
      title: "Welcome aboard",
      text: `Your ${membership.offer.name} membership is active. Manage it any time from the Store.`,
      cta: { label: "Go to my dashboard", href: "/dashboard" },
    };
  }
  return {
    ready: false,
    title: "Activating your membership",
    text: "Payment received. Your membership will be active in a moment.",
    cta: { label: "Back to the Store", href: "/store" },
  };
}

export default async function StoreSuccessPage({ searchParams }: Props) {
  const client = await requireRole("CLIENT");
  if (!(await arePaymentsAvailable(client))) redirect("/dashboard");
  const { session_id } = await searchParams;
  const view = await resolveView(client.id, session_id);
  const Icon = view.ready ? CircleCheck : Hourglass;

  return (
    <PageShell width="narrow">
      {!view.ready && <RefreshUntilReady />}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-4 py-10 text-center sm:px-6">
          <span
            className={cn(
              "flex size-14 items-center justify-center rounded-full",
              view.ready ? ROLE_CLASSES.success.soft : ROLE_CLASSES.info.soft
            )}
          >
            <Icon className={cn("size-7", view.ready ? ROLE_CLASSES.success.text : ROLE_CLASSES.info.text)} aria-hidden />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-title text-foreground">{view.title}</h1>
            <p className="max-w-md text-body text-muted-foreground" aria-live="polite">
              {view.text}
            </p>
          </div>
          <Button className="h-11 w-full sm:h-9 sm:w-auto" asChild>
            <Link href={view.cta.href}>{view.cta.label}</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
