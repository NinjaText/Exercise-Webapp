"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join {clubName}</CardTitle>
        <CardDescription>Enter the access code your club gave you to start your free trial.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-code">Access code</Label>
            <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value)}
              autoComplete="off" autoCapitalize="characters" required />
          </div>
          {error && <p className="text-sm text-danger-foreground" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending || !code.trim()}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
