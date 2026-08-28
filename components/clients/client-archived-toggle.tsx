"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
    <button
      type="button"
      onClick={toggle}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
    >
      {archived ? "Hide inactive" : "Show inactive"}
    </button>
  );
}
