import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.97_0.005_247)] px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">No problem</h1>
        <p className="text-slate-500">
          You can choose a plan whenever you&apos;re ready.
        </p>
        <Button asChild>
          <Link href="/billing">View Plans</Link>
        </Button>
      </div>
    </div>
  );
}
