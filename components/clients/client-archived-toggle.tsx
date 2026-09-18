"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ClientArchivedToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const archived = searchParams.get("archived") === "1";

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (archived) params.delete("archived");
    else params.set("archived", "1");
    router.push(`/clients?${params.toString()}`);
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle}>
      {archived ? "Hide inactive" : "Show inactive"}
    </Button>
  );
}
