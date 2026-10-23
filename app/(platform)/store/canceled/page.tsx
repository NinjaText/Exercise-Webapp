import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { arePaymentsAvailable } from "@/lib/payments/payments-access";
import { PageShell } from "@/components/shared/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Checkout canceled" };

export default async function StoreCanceledPage() {
  const client = await requireRole("CLIENT");
  if (!(await arePaymentsAvailable(client))) redirect("/dashboard");

  return (
    <PageShell width="narrow">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-neutral-soft">
            <ShoppingBag className="size-7 text-neutral-foreground" aria-hidden />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-title text-foreground">Checkout canceled</h1>
            <p className="max-w-md text-body text-muted-foreground">
              No payment was taken. You can pick up where you left off any time.
            </p>
          </div>
          <Button className="h-11 w-full sm:h-9 sm:w-auto" asChild>
            <Link href="/store">Back to the Store</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
