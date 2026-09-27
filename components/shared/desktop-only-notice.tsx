import { Monitor } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shown on phones in place of a desktop-only (Tier 3) tool. Hidden from `sm`
 * up; pair it with the tool wrapped in `hidden sm:block`.
 */
export function DesktopOnlyNotice({ className }: { className?: string }) {
  return (
    <Card
      data-slot="desktop-only-notice"
      className={cn("items-center gap-3 bg-muted px-6 py-8 text-center ring-0 sm:hidden", className)}
    >
      <Monitor className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-base font-semibold text-foreground">This tool is built for a larger screen</p>
      <p className="text-sm text-muted-foreground">Open Inmotus RX on a laptop to edit.</p>
    </Card>
  );
}
