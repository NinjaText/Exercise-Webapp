"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendBroadcastMessageAction } from "@/actions/message-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Megaphone, Loader2 } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  role: string;
}

interface BroadcastMessageDialogProps {
  contacts: Contact[];
}

export function BroadcastMessageDialog({ contacts }: BroadcastMessageDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)),
    );
  }

  function reset() {
    setContent("");
    setSelectedIds(new Set());
  }

  async function handleSend() {
    if (selectedIds.size === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    if (!content.trim()) {
      toast.error("Please write a message");
      return;
    }

    setLoading(true);
    const result = await sendBroadcastMessageAction(
      allSelected
        ? { sendToAll: true, content: content.trim() }
        : { recipientIds: Array.from(selectedIds), content: content.trim() },
    );
    setLoading(false);

    if (result.success) {
      toast.success(
        `Message sent to ${result.sentCount} client${result.sentCount !== 1 ? "s" : ""}`,
      );
      setOpen(false);
      reset();
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to send broadcast");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "outline" })}>
        <Megaphone className="mr-2 h-4 w-4" />
        Broadcast
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Broadcast Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Recipients</Label>
              {contacts.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  Select all
                </label>
              )}
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No clients available. Clients need to be linked first.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-input p-1">
                {contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      checked={selectedIds.has(contact.id)}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={contact.imageUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {contact.firstName[0]}
                        {contact.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {contact.firstName} {contact.lastName}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {contact.role.toLowerCase()}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a message to your clients..."
              rows={4}
              className="resize-none"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={loading || selectedIds.size === 0 || !content.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send to {selectedIds.size || 0}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
