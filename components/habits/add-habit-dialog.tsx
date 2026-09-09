"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createHabitAction } from "@/actions/habit-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_OPTIONS = ["💧", "🏃‍♂️", "😴", "🧘‍♂️", "🥗", "💊", "📖", "🚶"];

const FREQUENCY_OPTIONS = [
  { value: "DAILY",  label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface AddHabitDialogProps {
  /** Trainer's linked clients — only passed when user is a TRAINER. */
  clients?: Client[];
  /** Pre-selected client id (e.g. when triggered from a client's profile page). */
  defaultClientId?: string;
  /** Override the trigger label/icon. */
  triggerLabel?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddHabitDialog({
  clients,
  defaultClientId,
  triggerLabel = "Add Habit",
}: AddHabitDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [name, setName]               = useState("");
  const [icon, setIcon]               = useState(ICON_OPTIONS[0]);
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit]               = useState("");
  const [frequency, setFrequency]     = useState<"DAILY" | "WEEKLY">("DAILY");
  const [clientId, setClientId]     = useState(defaultClientId ?? "");

  const isTrainer = Array.isArray(clients);

  function resetForm() {
    setName("");
    setIcon(ICON_OPTIONS[0]);
    setTargetValue("");
    setUnit("");
    setFrequency("DAILY");
    setClientId(defaultClientId ?? "");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a habit name");
      return;
    }

    if (isTrainer && !clientId) {
      toast.error("Please select a client");
      return;
    }

    startTransition(async () => {
      const result = await createHabitAction({
        name: name.trim(),
        icon,
        targetValue: targetValue ? parseFloat(targetValue) : undefined,
        unit: unit.trim() || undefined,
        frequency,
        clientId: isTrainer ? clientId : undefined,
      });

      if (result.success) {
        toast.success("Habit created successfully");
        setOpen(false);
        resetForm();
      } else {
        toast.error(result.error ?? "Failed to create habit");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* base-ui DialogTrigger does not accept asChild — apply button styling directly */}
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a Habit</DialogTitle>
            <DialogDescription>
              Build a healthy routine by tracking daily or weekly habits.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5">
            {/* Client selector — trainer only */}
            {isTrainer && (
              <div className="space-y-2">
                <Label htmlFor="habit-client">Client</Label>
                <select
                  id="habit-client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  disabled={isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select a client…</option>
                  {clients!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Habit name */}
            <div className="space-y-2">
              <Label htmlFor="habit-name">Habit name</Label>
              <Input
                id="habit-name"
                placeholder="e.g. Drink 8 glasses of water"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={!isTrainer}
                disabled={isPending}
                maxLength={80}
              />
            </div>

            {/* Icon picker */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    disabled={isPending}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all",
                      icon === emoji
                        ? "ring-2 ring-primary bg-primary/10"
                        : "ring-1 ring-border/50 hover:ring-border"
                    )}
                    aria-label={`Select icon ${emoji}`}
                    aria-pressed={icon === emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Target value + unit (optional) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="habit-target">Target (optional)</Label>
                <Input
                  id="habit-target"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="e.g. 8"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="habit-unit">Unit (optional)</Label>
                <Input
                  id="habit-unit"
                  placeholder="e.g. glasses"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={isPending}
                  maxLength={20}
                />
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label>Frequency</Label>
              <div className="flex gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value as "DAILY" | "WEEKLY")}
                    disabled={isPending}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                      frequency === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "ring-1 ring-border/50 hover:ring-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim() || (isTrainer && !clientId)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Habit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
