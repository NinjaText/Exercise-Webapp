"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * An inline info affordance for a Clinical Profile field. Rendered as a real
 * button so it is reachable by keyboard, not hover-only.
 */
export function FieldInfo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`About ${label}`}
          className="ml-1 inline-flex align-middle text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
