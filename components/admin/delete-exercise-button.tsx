"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteExerciseAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteExerciseButton({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      // Auto-reset after 3 seconds if user doesn't confirm
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await deleteExerciseAction(exerciseId);
      if (result.success) {
        toast.success(`"${exerciseName}" deleted`);
        router.refresh();
      } else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        Confirm?
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick}>
      <Trash2 className="h-3 w-3" />
      Delete
    </Button>
  );
}
