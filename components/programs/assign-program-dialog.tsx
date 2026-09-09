"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignProgramAction } from "@/actions/program-actions";
import { queuePendingProgramAssignmentAction } from "@/actions/pending-program-assignment-actions";
import { format } from "date-fns";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

export interface AssignProgramOption {
  id: string;
  name: string;
  schedulingType?: string | null;
}

/**
 * An invited-but-not-yet-registered client. No `User` row exists for them yet,
 * so the assignment is queued against their email and applied when they join.
 */
export interface LockedClient {
  firstName: string;
  lastName?: string;
  pendingEmail: string;
}

interface Props {
  /** The program being assigned. Omit in `lockedClient` mode, where the user picks one. */
  programId?: string;
  clients: { id: string; firstName: string; lastName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The target program's scheduling type. On-Demand ("Resource") programs have
   * no schedule, so the Start Date field is hidden and no date is submitted.
   * Undefined/null is treated as SCHEDULED (see getProgramSchedulingType).
   */
  schedulingType?: string | null;
  /**
   * Deferred-assignment mode: the client is fixed and display-only (they don't
   * exist yet), and a program picker replaces the client picker. Requires
   * `programs`. Submitting queues the assignment instead of applying it.
   */
  lockedClient?: LockedClient;
  /** Programs offered by the picker in `lockedClient` mode. */
  programs?: AssignProgramOption[];
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate?: string | null;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
  /** Called after a successful assign/queue, in addition to closing the dialog. */
  onAssigned?: () => void;
}

export function AssignProgramDialog({
  programId,
  clients,
  open,
  onOpenChange,
  schedulingType,
  lockedClient,
  programs = [],
  assignAction,
  onAssigned,
}: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const isDeferred = Boolean(lockedClient);
  const effectiveProgramId = isDeferred ? selectedProgramId : programId ?? "";
  const selectedProgram = programs.find((p) => p.id === selectedProgramId);
  const effectiveSchedulingType = isDeferred ? selectedProgram?.schedulingType : schedulingType;
  const isOnDemand = getProgramSchedulingType({ schedulingType: effectiveSchedulingType }) === "ON_DEMAND";

  const lockedClientName = lockedClient
    ? [lockedClient.firstName, lockedClient.lastName].filter(Boolean).join(" ").trim() ||
      lockedClient.pendingEmail
    : "";

  async function handleAssign() {
    if (!effectiveProgramId) {
      toast.error(isDeferred ? "Select a program" : "No program selected");
      return;
    }
    if (!isDeferred && !clientId) {
      toast.error("Select a client");
      return;
    }

    setSaving(true);
    try {
      const isoStartDate = isOnDemand ? null : new Date(startDate).toISOString();

      const result = isDeferred
        ? await queuePendingProgramAssignmentAction({
            invitedEmail: lockedClient!.pendingEmail,
            programId: effectiveProgramId,
            startDate: isoStartDate,
          })
        : await (assignAction ?? assignProgramAction)({
            programId: effectiveProgramId,
            clientId,
            startDate: isoStartDate,
          });

      if (result.success) {
        if (isDeferred) {
          toast.success(`Program queued — it'll be assigned once ${lockedClientName} joins`);
        } else {
          toast.success(
            isOnDemand
              ? "Program assigned — available to client now"
              : "Program assigned and sessions scheduled"
          );
        }
        onOpenChange(false);
        onAssigned?.();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeferred
              ? `Assign a Program to ${lockedClientName}`
              : isOnDemand
                ? "Assign Resource to Client"
                : "Assign Program to Client"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isDeferred ? (
            <>
              <div className="space-y-2">
                <Label>Client</Label>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <p className="font-medium">{lockedClientName}</p>
                  <p className="text-xs text-muted-foreground">{lockedClient!.pendingEmail}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Program will be assigned once they join.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Program</Label>
                <Select
                  value={selectedProgramId}
                  onValueChange={(v) => setSelectedProgramId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a program">
                      {(value: string | null) =>
                        programs.find((p) => p.id === value)?.name ?? "Select a program"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client">
                    {(value: string | null) => {
                      const client = clients.find((c) => c.id === value);
                      return client ? `${client.firstName} ${client.lastName}` : "Select a client";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isOnDemand ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              This is a resource — it has no schedule. Once assigned it&apos;s
              available to the client to use any time, and it never counts
              toward adherence.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {isDeferred && (
                <p className="text-xs text-muted-foreground">
                  If this date has passed by the time they join, their program starts that day
                  instead.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={saving}>
            {saving
              ? isDeferred
                ? "Saving..."
                : "Assigning..."
              : isDeferred
                ? "Queue Program"
                : isOnDemand
                  ? "Assign Resource"
                  : "Assign Program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
