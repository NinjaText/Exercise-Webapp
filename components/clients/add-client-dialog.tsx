"use client";

import { useState, useTransition } from "react";
import { inviteClientAction } from "@/actions/invite-client-action";
import { bulkInviteAction, type InviteEmailResult } from "@/actions/bulk-invite-action";
import {
  getAssignableProgramsAction,
  type AssignableProgramOption,
} from "@/actions/program-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkInviteTab } from "@/components/shared/bulk-invite-tab";
import { AssignProgramDialog } from "@/components/programs/assign-program-dialog";
import { toast } from "sonner";
import { CircleCheck, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_TRIGGER_CLASSNAME =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none select-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-8";

/** The invitee, as captured by this dialog, once the invitation has been sent. */
interface InvitedClient {
  email: string;
  firstName: string;
  lastName: string;
}

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "" };

export function AddClientDialog({ triggerClassName }: { triggerClassName?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [invited, setInvited] = useState<InvitedClient | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [programs, setPrograms] = useState<AssignableProgramOption[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetAndClose() {
    setOpen(false);
    setForm(EMPTY_FORM);
    setInvited(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const email = form.email.trim();
    const firstName = form.firstName.trim();
    if (!email) {
      toast.error("Please enter a client email address");
      return;
    }
    if (!firstName) {
      toast.error("Please enter the client's first name");
      return;
    }

    startTransition(async () => {
      const result = await inviteClientAction({
        email,
        firstName,
        lastName: form.lastName,
        phone: form.phone,
      });

      if (result.success) {
        toast.success(
          "Invitation sent! The client will receive an email to join your organization."
        );
        // Stay open on a success panel so the trainer can immediately queue a
        // program for the invitee without re-finding them later.
        setInvited({ email, firstName, lastName: form.lastName.trim() });
      } else {
        toast.error(result.error ?? "Failed to send invitation");
      }
    });
  }

  async function handleOpenAssign() {
    setLoadingPrograms(true);
    const result = await getAssignableProgramsAction();
    setLoadingPrograms(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to load your programs");
      return;
    }
    if (result.data.length === 0) {
      toast.error("You don't have any programs to assign yet");
      return;
    }
    setPrograms(result.data);
    setAssignOpen(true);
  }

  async function handleBulkInvite(emails: string[]): Promise<InviteEmailResult[]> {
    const result = await bulkInviteAction(emails);
    if (!result.success) {
      toast.error(result.error ?? "Bulk invite failed");
      return emails.map((e) => ({ email: e, success: false, error: result.error }));
    }
    return result.results;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
        <DialogTrigger className={cn(DEFAULT_TRIGGER_CLASSNAME, triggerClassName)}>
          <UserPlus className="h-4 w-4" />
          Invite Client
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          {invited ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CircleCheck className="h-5 w-5 text-success" />
                  Invitation sent
                </DialogTitle>
                <DialogDescription>
                  {invited.firstName} will get an email at {invited.email} to join your
                  organization.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={resetAndClose}>
                  Done
                </Button>
                <Button onClick={handleOpenAssign} disabled={loadingPrograms}>
                  {loadingPrograms && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Assign a Program
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite Clients</DialogTitle>
                <DialogDescription>
                  Invite one client by email, or upload a CSV to invite many at once.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="single" className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="single" className="flex-1">
                    Single
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="flex-1">
                    Bulk CSV
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="single">
                  <form onSubmit={handleSubmit}>
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="client-first-name">First Name</Label>
                          <Input
                            id="client-first-name"
                            placeholder="Jane"
                            value={form.firstName}
                            onChange={(e) => updateField("firstName", e.target.value)}
                            required
                            autoFocus
                            disabled={isPending}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="client-last-name">
                            Last Name{" "}
                            <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id="client-last-name"
                            placeholder="Doe"
                            value={form.lastName}
                            onChange={(e) => updateField("lastName", e.target.value)}
                            disabled={isPending}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client-email">Client Email</Label>
                        <Input
                          id="client-email"
                          type="email"
                          placeholder="client@example.com"
                          value={form.email}
                          onChange={(e) => updateField("email", e.target.value)}
                          required
                          disabled={isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client-phone">
                          Phone{" "}
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="client-phone"
                          type="tel"
                          placeholder="+1 555 123 4567"
                          value={form.phone}
                          onChange={(e) => updateField("phone", e.target.value)}
                          disabled={isPending}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="submit"
                        disabled={isPending || !form.email.trim() || !form.firstName.trim()}
                      >
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send Invitation
                      </Button>
                    </div>
                  </form>
                </TabsContent>
                <TabsContent value="bulk" className="mt-4">
                  <BulkInviteTab onInvite={handleBulkInvite} onDone={resetAndClose} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {invited && (
        <AssignProgramDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          clients={[]}
          programs={programs}
          lockedClient={{
            firstName: invited.firstName,
            lastName: invited.lastName,
            pendingEmail: invited.email,
          }}
          onAssigned={resetAndClose}
        />
      )}
    </>
  );
}
