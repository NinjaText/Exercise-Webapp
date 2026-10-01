"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const POLL_INTERVAL_MS = 3000;
const SLOW_AFTER_MS = 45000;

export function PendingStatus() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const poll = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(slowTimer);
    };
  }, [router]);

  return (
    <Card className="gap-6 py-6 shadow-md">
      <CardHeader className="items-center text-center">
        <Loader2 className="mb-2 size-8 animate-spin text-primary" />
        <CardTitle>Setting up your program…</CardTitle>
        <CardDescription>
          {slow
            ? "This is taking a little longer than usual — larger programs can take up to a minute. This page will update automatically."
            : "This usually takes just a few seconds. This page will update automatically."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
