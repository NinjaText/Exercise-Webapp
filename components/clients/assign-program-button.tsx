"use client";

import { useState } from "react";
import { Loader2, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getAssignableProgramsAction,
  type AssignableProgramOption,
} from "@/actions/program-actions";
import {
  AssignProgramDialog,
  type TargetClient,
} from "@/components/programs/assign-program-dialog";

/**
 * Assigns an *existing* program to an existing client, from that client's page.
 *
 * The other direction — open a program, pick a client — already existed on the
 * program detail page. This is the one a trainer actually wants when they're
 * looking at a person and thinking about what to give them.
 */
export function AssignProgramButton({ client }: { client: TargetClient }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<AssignableProgramOption[]>([]);

  async function handleOpen() {
    setLoading(true);
    const result = await getAssignableProgramsAction();
    setLoading(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to load your programs");
      return;
    }
    if (result.data.length === 0) {
      toast.error("You don't have any programs to assign yet");
      return;
    }
    setPrograms(result.data);
    setOpen(true);
  }

  return (
    <>
      <Button variant="default" onClick={handleOpen} disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ListPlus className="h-4 w-4" />
        )}
        Assign program
      </Button>

      <AssignProgramDialog
        open={open}
        onOpenChange={setOpen}
        clients={[]}
        programs={programs}
        targetClient={client}
      />
    </>
  );
}
