"use client";

import { useState, useTransition } from "react";
import { inviteClientAction } from "@/actions/invite-client-action";
import { bulkInviteAction, type InviteEmailResult } from "@/actions/bulk-invite-action";
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
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_TRIGGER_CLASSNAME =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none select-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-8";

export function AddClientDialog({ triggerClassName }: { triggerClassName?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Please enter a client email address");
      return;
    }

    startTransition(async () => {
      const result = await inviteClientAction(trimmed);

      if (result.success) {
        toast.success(
          "Invitation sent! The client will receive an email to join your organization."
        );
        setEmail("");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to send invitation");
      }
    });
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(DEFAULT_TRIGGER_CLASSNAME, triggerClassName)}>
        <UserPlus className="h-4 w-4" />
        Invite Client
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
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
                <div className="space-y-2">
                  <Label htmlFor="client-email">Client Email</Label>
                  <Input
                    id="client-email"
                    type="email"
                    placeholder="client@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" disabled={isPending || !email.trim()}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Invitation
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="bulk" className="mt-4">
            <BulkInviteTab
              onInvite={handleBulkInvite}
              onDone={() => setOpen(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
