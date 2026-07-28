"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { NutritionTargetForm } from "./nutrition-target-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface NutritionGoalsDialogProps {
  clientId: string;
  role: "TRAINER" | "CLIENT";
  target: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    waterMl: number | null;
    mealsPerDayTarget: number | null;
    clientEditableFields: string[];
  };
}

export function NutritionGoalsDialog({ clientId, role, target }: NutritionGoalsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-border/60 text-muted-foreground transition-all hover:text-foreground hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Target className="h-3.5 w-3.5" />
        {role === "TRAINER" ? "Edit Goals" : "My Goals"}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nutrition Goals</DialogTitle>
          <DialogDescription>
            {role === "TRAINER"
              ? "Set daily targets and choose which fields the client can edit themselves."
              : "Fields your coach has opened up for you to edit are unlocked below."}
          </DialogDescription>
        </DialogHeader>

        <NutritionTargetForm
          clientId={clientId}
          role={role}
          target={target}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
