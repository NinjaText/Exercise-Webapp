"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function BillingSuccessPage() {
  const router = useRouter();
  const attempts = useRef(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      attempts.current += 1;
      try {
        const res = await fetch("/api/stripe/status");
        const data = await res.json() as { subscription?: { status: string } };
        if (
          data.subscription?.status === "ACTIVE" ||
          attempts.current >= 10
        ) {
          clearInterval(poll);
          router.push("/dashboard");
        }
      } catch {
        if (attempts.current >= 10) {
          clearInterval(poll);
          router.push("/dashboard");
        }
      }
    }, 1000);

    return () => clearInterval(poll);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.97_0.005_247)] px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">You&apos;re all set!</h1>
        <p className="text-slate-500">
          Your subscription is now active. Redirecting to dashboard…
        </p>
      </div>
    </div>
  );
}
