"use client";

import { useState } from "react";
import { Loader2, Reply, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { replyToClientNoteAction } from "@/actions/message-actions";

interface ClientNoteReplyProps {
  sessionId: string;
  blockExerciseId: string;
  clientNote: string;
  /** Used only for copy in the toast/placeholder. */
  clientFirstName: string;
}

/**
 * The trainer-facing "Client note" banner on a reviewed session, plus an inline
 * composer that sends a reply into the normal Messages thread. The reply carries
 * a quote of this note so the client sees which exercise is being answered.
 */
export function ClientNoteReply({
  sessionId,
  blockExerciseId,
  clientNote,
  clientFirstName,
}: ClientNoteReplyProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed) return;

    setSending(true);
    const result = await replyToClientNoteAction(sessionId, blockExerciseId, trimmed);
    setSending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Reply sent to ${clientFirstName}`);
    setContent("");
    setComposerOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setComposerOpen(false);
    }
  }

  return (
    <div className="border-b border-border/60 bg-blue-50">
      <div className="flex items-start gap-2 px-4 py-3">
        <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-widest text-blue-500">
          Client note
        </span>
        <p className="flex-1 text-sm italic text-blue-700">{clientNote}</p>
        {!composerOpen && (
          <Button
            variant="ghost"
            size="sm"
            className="-my-1 shrink-0 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
            onClick={() => setComposerOpen(true)}
          >
            <Reply className="mr-1 h-3.5 w-3.5" />
            Reply
          </Button>
        )}
      </div>

      {composerOpen && (
        <div className="space-y-2 border-t border-blue-100 px-4 py-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Reply to ${clientFirstName}...`}
            rows={2}
            autoFocus
            className="min-h-[3rem] resize-none bg-background text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setComposerOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSend} disabled={sending || !content.trim()}>
              {sending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
