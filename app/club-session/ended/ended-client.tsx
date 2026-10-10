"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const ADMIN_URL = "/admin";

export function ClubSessionEnded() {
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn, user } = useUser();
  const isHouseCoach = (user?.publicMetadata as { houseCoach?: boolean } | undefined)?.houseCoach === true;
  // One-shot: StrictMode double-invokes effects.
  const started = useRef(false);

  useEffect(() => {
    // Only the house coach session is stale; anyone else is left signed in.
    if (!isLoaded || !isSignedIn || !isHouseCoach || started.current) return;
    started.current = true;
    void signOut({ redirectUrl: ADMIN_URL });
  }, [isLoaded, isSignedIn, isHouseCoach, signOut]);

  if (isSignedIn && isHouseCoach) {
    return (
      <Button variant="outline" onClick={() => void signOut({ redirectUrl: ADMIN_URL })}>
        Back to admin
      </Button>
    );
  }

  return (
    <Button asChild variant="outline">
      <Link href={ADMIN_URL}>Back to admin</Link>
    </Button>
  );
}
