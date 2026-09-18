"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { NutritionTargetForm } from "./nutrition-target-form";
import { Button, type ButtonProps } from "@/components/ui/button";
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
  variant?: ButtonProps["variant"];
}

export function NutritionGoalsDialog({
  clientId,
  role,
  target,
  variant = "outline",
}: NutritionGoalsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} />}>
        <Target className="size-4" />
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
