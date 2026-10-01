"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyJoinCodeAction } from "@/actions/club-join-actions";

export function JoinCodeForm({ slug, clubName }: { slug: string; clubName: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await verifyJoinCodeAction(slug, code);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label={`Join ${clubName}`}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="join-code">Access code</Label>
        <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value)}
          autoComplete="off" autoCapitalize="characters" required className="h-11" />
      </div>
      {error && <p className="text-body text-danger-foreground" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending || !code.trim()}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
