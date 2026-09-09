"use client";

import { useState, type ReactElement } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Library, Pencil, Sparkles, Upload } from "lucide-react";

interface GenerateProgramEntryDialogProps {
  /** Pre-selects a client in the "Generate with AI" flow, e.g. from a client-specific alert. */
  clientId?: string;
  /** The trigger element (typically a styled `<Button />`) that opens the dialog. */
  trigger: ReactElement;
  /** Content rendered inside the trigger, e.g. an icon + label. */
  children: React.ReactNode;
}

/**
 * The two-choice entry point for creating a program.
 *
 * A dialog rather than a dropdown so the two primary paths — AI vs. manual —
 * get equal, explicit weight instead of reading as a list of four equivalent
 * menu items. The two lower-traffic paths (upload, template) stay available as
 * secondary links so nothing the dropdown offered is lost.
 */
export function GenerateProgramEntryDialog({
  clientId,
  trigger,
  children,
}: GenerateProgramEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const generateHref = clientId ? `/programs/generate?clientId=${clientId}` : "/programs/generate";

  const primaryChoices = [
    {
      href: generateHref,
      icon: Sparkles,
      iconClassName: "bg-blue-500/10 text-blue-600",
      title: "Generate with AI",
      description: "Describe the goal and get a full program draft in seconds.",
    },
    {
      href: "/programs/new",
      icon: Pencil,
      iconClassName: "bg-muted text-muted-foreground",
      title: "Create Manually",
      description: "Build week by week with full control over every exercise.",
    },
  ];

  const secondaryChoices = [
    { href: "/programs/upload", icon: Upload, label: "Upload a program/document" },
    { href: "/programs?tab=templates", icon: Library, label: "Use a template" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Program</DialogTitle>
          <DialogDescription>How would you like to start?</DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {primaryChoices.map((choice) => (
            <Link
              key={choice.href}
              href={choice.href}
              onClick={() => setOpen(false)}
              className="group flex flex-col gap-2 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${choice.iconClassName}`}
              >
                <choice.icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-semibold">{choice.title}</span>
              <span className="text-xs text-muted-foreground">{choice.description}</span>
            </Link>
          ))}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
          {secondaryChoices.map((choice) => (
            <Link
              key={choice.href}
              href={choice.href}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <choice.icon className="h-3.5 w-3.5" />
              {choice.label}
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
