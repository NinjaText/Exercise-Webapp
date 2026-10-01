"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * A read-only value with a copy button: the club's join link or access code.
 * `absolute` copies a path as a full URL on the current origin.
 */
export function CopyValue({ label, value, absolute }: { label: string; value: string; absolute?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      ?.writeText(absolute ? `${window.location.origin}${value}` : value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Couldn't copy to the clipboard"));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption font-medium">{label}</p>
      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface-muted pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate text-body text-foreground">{value}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${label.toLowerCase()}`} onClick={copy}>
          {copied ? <Check className="size-4 text-success-foreground" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
