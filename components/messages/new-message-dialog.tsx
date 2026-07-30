"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendMessageAction } from "@/actions/message-actions";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PenSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  role: string;
}

interface NewMessageDialogProps {
  contacts: Contact[];
}

export function NewMessageDialog({ contacts }: NewMessageDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!selectedContact) {
      toast.error("Please select a recipient");
      return;
    }
    if (!content.trim()) {
      toast.error("Please write a message");
      return;
    }

    setLoading(true);
    const result = await sendMessageAction({
      recipientId: selectedContact.id,
      content: content.trim(),
    });
    setLoading(false);

    if (result.success) {
      toast.success("Message sent");
      setOpen(false);
      setContent("");
      setSelectedContact(null);
      router.push(`/messages/${selectedContact.id}`);
    } else {
      toast.error(result.error ?? "Failed to send message");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants()}>
        <PenSquare className="mr-2 h-4 w-4" />
        New Message
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Contact list */}
          <div className="space-y-2">
            <Label>To</Label>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No contacts available. Clients need to be linked first.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-input p-1">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedContact(contact)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      selectedContact?.id === contact.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={contact.imageUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {contact.firstName[0]}{contact.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {contact.firstName} {contact.lastName}
                      </p>
                      <p className={cn(
                        "text-xs capitalize",
                        selectedContact?.id === contact.id
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      )}>
                        {contact.role.toLowerCase()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Message textarea */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your message..."
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
              disabled={loading || !selectedContact || !content.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
