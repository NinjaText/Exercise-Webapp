"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { getDisplayName, getInitials } from "@/lib/utils/display-name";
import {
  ASSIGN_KIND_COPY,
  AssignKindSelector,
  ProgramPicker,
  ProgramTile,
  SchedulingPill,
  type AssignKind,
  type PickerProgram,
  type PickerSort,
} from "@/components/programs/program-picker";

export type AssignProgramOption = PickerProgram;

/**
 * An invited-but-not-yet-registered client. No `User` row exists for them yet,
 * so the assignment is queued against their email and applied when they join.
 */
export interface LockedClient {
  firstName: string;
  lastName?: string;
  pendingEmail: string;
}

/** A real, registered client the dialog assigns to straight away. */
export interface TargetClient {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  imageUrl?: string | null;
}

interface Props {
  /** The program being assigned. Omit in the two modes where the user picks one. */
  programId?: string;
  /** Display name for `programId`, so the dialog can name what it is assigning. */
  programName?: string;
  clients: { id: string; firstName: string; lastName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The target program's scheduling type, in `programId` mode. On-Demand
   * ("Resource") programs have no schedule, so the Start Date field is hidden
   * and no date is submitted. Undefined/null is treated as SCHEDULED (see
   * getProgramSchedulingType).
   */
  schedulingType?: string | null;
  /**
   * Deferred-assignment mode: the client is fixed and display-only (they don't
   * exist yet), and a program picker replaces the client picker. Requires
   * `programs`. Submitting queues the assignment instead of applying it.
   */
  lockedClient?: LockedClient;
  /**
   * Client-targeted mode: an existing client is fixed and the trainer picks a
   * program for them. Requires `programs`. Submitting assigns immediately.
   */
  targetClient?: TargetClient;
  /** Programs offered by the picker in `lockedClient` / `targetClient` mode. */
  programs?: AssignProgramOption[];
  assignAction?: (input: {
    programId: string;
    clientId: string;
    startDate?: string | null;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
  /** Called after a successful assign/queue, in addition to closing the dialog. */
  onAssigned?: () => void;
  /** Pre-selects a client, e.g. when arriving from that client's profile. */
  initialClientId?: string;
}

export function AssignProgramDialog({
  programId,
  programName,
  clients,
  open,
  onOpenChange,
  schedulingType,
  lockedClient,
  targetClient,
  programs = [],
  assignAction,
  onAssigned,
  initialClientId,
}: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  // Picker state. Kept here rather than inside ProgramPicker so switching the
  // assign kind can clear the search and chip along with the selection.
  const [kind, setKind] = useState<AssignKind>("SCHEDULED");
  const [search, setSearch] = useState("");
  const [facet, setFacet] = useState<string | null>(null);
  const [sort, setSort] = useState<PickerSort>("recent");

  const isDeferred = Boolean(lockedClient);
  const picksProgram = isDeferred || Boolean(targetClient);

  const effectiveProgramId = picksProgram ? selectedProgramId : programId ?? "";

  // In the picker modes the tab *is* the scheduling type, so a selection can
  // never disagree with it; otherwise it comes from the fixed program.
  const isOnDemand = picksProgram
    ? kind === "ON_DEMAND"
    : getProgramSchedulingType({ schedulingType }) === "ON_DEMAND";

  const counts = useMemo(
    () =>
      programs.reduce(
        (acc, program) => {
          acc[getProgramSchedulingType(program)] += 1;
          return acc;
        },
        { SCHEDULED: 0, ON_DEMAND: 0 } as Record<AssignKind, number>
      ),
    [programs]
  );

  const person = lockedClient
    ? {
        firstName: lockedClient.firstName,
        lastName: lockedClient.lastName ?? null,
        email: lockedClient.pendingEmail,
        imageUrl: null,
      }
    : targetClient
      ? {
          firstName: targetClient.firstName ?? null,
          lastName: targetClient.lastName ?? null,
          email: targetClient.email ?? null,
          imageUrl: targetClient.imageUrl ?? null,
        }
      : null;
  const personName = person ? getDisplayName(person) : "";

  // Reopening the dialog for a different client or program must not inherit the
  // previous run's picker state.
  useEffect(() => {
    if (!open) return;
    setSelectedProgramId("");
    setSearch("");
    setFacet(null);
    setClientId(initialClientId ?? "");
  }, [open, initialClientId]);

  function handleKindChange(next: AssignKind) {
    setKind(next);
    setSelectedProgramId("");
    setSearch("");
    setFacet(null);
  }

  async function handleAssign() {
    if (!effectiveProgramId) {
      toast.error(
        picksProgram
          ? isOnDemand
            ? "Select a resource"
            : "Select a program"
          : "No program selected"
      );
      return;
    }
    if (!picksProgram && !clientId) {
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
            clientId: targetClient ? targetClient.id : clientId,
            startDate: isoStartDate,
          });

      if (result.success) {
        if (isDeferred) {
          toast.success(`Program queued — it'll be assigned once ${personName} joins`);
        } else {
          toast.success(
            isOnDemand
              ? "Resource assigned — available to client now"
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

  const title = person
    ? `Assign to ${personName}`
    : isOnDemand
      ? "Assign Resource to Client"
      : "Assign Program to Client";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* min-w-0: DialogContent is a grid, so without it this item's
            min-content width stretches the column past max-w-2xl. */}
        <div className="min-w-0 space-y-5 py-2">
          {person && (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={person.imageUrl ?? undefined} />
                <AvatarFallback>{getInitials(person)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{personName}</p>
                {person.email && person.email !== personName && (
                  <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                )}
              </div>
            </div>
          )}

          {isDeferred && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              They haven&apos;t joined yet — this is queued and applied automatically the
              moment their account is created.
            </p>
          )}

          {picksProgram ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">What would you like to assign?</p>
                <AssignKindSelector value={kind} onChange={handleKindChange} counts={counts} />
              </div>

              <ProgramPicker
                programs={programs}
                kind={kind}
                selectedId={selectedProgramId}
                onSelect={setSelectedProgramId}
                search={search}
                onSearchChange={setSearch}
                facet={facet}
                onFacetChange={setFacet}
                sort={sort}
                onSortChange={setSort}
              />
            </>
          ) : (
            <>
              {/* The program is already chosen here, so it is stated rather than
                  picked — the trainer still needs to see which kind it is. */}
              <div className="space-y-2">
                <Label>Assigning</Label>
                <div className="flex items-center gap-3 rounded-md border border-border px-3 py-3">
                  <ProgramTile kind={isOnDemand ? "ON_DEMAND" : "SCHEDULED"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {programName ?? ASSIGN_KIND_COPY[isOnDemand ? "ON_DEMAND" : "SCHEDULED"].title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ASSIGN_KIND_COPY[isOnDemand ? "ON_DEMAND" : "SCHEDULED"].blurb}
                    </p>
                  </div>
                  <SchedulingPill kind={isOnDemand ? "ON_DEMAND" : "SCHEDULED"} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client">
                      {(value: string | null) => {
                        const client = clients.find((c) => c.id === value);
                        return client
                          ? `${client.firstName} ${client.lastName}`
                          : "Select a client";
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
            </>
          )}

          {isOnDemand ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              This is a resource — it has no schedule. Once assigned it&apos;s available
              to the client to use any time, and it never counts toward adherence.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="assign-start-date">Start Date</Label>
              <Input
                id="assign-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="sm:max-w-xs"
              />
              {isDeferred && (
                <p className="text-xs text-muted-foreground">
                  If this date has passed by the time they join, their program starts that
                  day instead.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={saving || (picksProgram && !selectedProgramId)}
          >
            {saving
              ? isDeferred
                ? "Saving..."
                : "Assigning..."
              : isDeferred
                ? isOnDemand
                  ? "Queue Resource"
                  : "Queue Program"
                : isOnDemand
                  ? "Assign Resource"
                  : "Assign Program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
