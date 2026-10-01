"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeClubTrainerOnboarding } from "@/actions/club-trainer-onboarding-actions";

export function ClubTrainerOnboardingForm({
  clubName,
  initialFirstName,
  initialLastName,
}: {
  clubName: string;
  initialFirstName: string;
  initialLastName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await completeClubTrainerOnboarding({ firstName, lastName });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, coach</CardTitle>
        <CardDescription>You&apos;re the trainer for {clubName}. Tell us your name to get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={80}
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending || !firstName.trim() || !lastName.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
