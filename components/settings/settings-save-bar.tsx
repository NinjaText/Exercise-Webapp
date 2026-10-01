"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SettingsSaveBarProps {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  /** Omit for a form whose submit button should submit the surrounding <form>. */
  onSave?: () => void;
  /** Disables Save while the form is invalid, without hiding the bar. */
  canSave?: boolean;
  label?: string;
}

/**
 * Floating "unsaved changes" bar for multi-panel settings forms. Sticks to
 * the bottom of the scrolling content (above the phone tab bar) and only
 * appears once something has changed, so a clean form shows no buttons.
 */
export function SettingsSaveBar({ dirty, saving, onDiscard, onSave, canSave = true, label = "Save changes" }: SettingsSaveBarProps) {
  const visible = dirty || saving;

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "sticky bottom-[calc(1rem_+_var(--tab-bar-height)_+_var(--safe-bottom))] z-20 mt-2 transition-all duration-200 lg:bottom-6",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}
    >
      <div
        role="status"
        className="flex items-center justify-between gap-4 rounded-xl bg-card px-4 py-3 shadow-lg ring-1 ring-border sm:px-5"
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          Unsaved changes
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving} tabIndex={visible ? 0 : -1}>
            Discard
          </Button>
          <Button
            type={onSave ? "button" : "submit"}
            onClick={onSave}
            disabled={saving || !canSave}
            tabIndex={visible ? 0 : -1}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}
