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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignCheckInAction } from "@/actions/checkin-actions";
import { UserPlus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  templateId: string;
  templateName: string;
  clients: Client[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignCheckInDialog({
  templateId,
  templateName,
  clients,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function handleAssign() {
    if (!clientId) {
      toast.error("Please select a client");
      return;
    }

    setAssigning(true);
    try {
      const result = await assignCheckInAction(templateId, clientId);
      if (result.success) {
        toast.success("Check-in assigned successfully");
        setOpen(false);
        setClientId("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setAssigning(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 w-full"
      >
        <UserPlus className="h-4 w-4" />
        Assign to Client
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Check-in to Client</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 border border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Template</p>
              <p className="mt-0.5 font-semibold">{templateName}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-select">Select Client</Label>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No clients linked to your account yet.
                </p>
              ) : (
                <Select
                  value={clientId}
                  onValueChange={(v) => setClientId(v ?? "")}
                >
                  <SelectTrigger id="client-select">
                    <SelectValue placeholder="Choose a client...">
                      {(value: string | null) => {
                        const client = clients.find((c) => c.id === value);
                        return client ? `${client.firstName} ${client.lastName}` : "Choose a client...";
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
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setClientId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assigning || !clientId || clients.length === 0}
              className="gap-2"
            >
              <UserPlus className="h-4 w-4" />
              {assigning ? "Assigning..." : "Assign Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
