"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  sendMessageAction,
  markMessagesReadAction,
  editMessageAction,
  deleteMessageAction,
} from "@/actions/message-actions";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { toast } from "sonner";
import { Send, Loader2, Check, CheckCheck, Mic, MoreVertical, Pencil, Trash2, Dumbbell } from "lucide-react";
import type {
  ThreadItem,
  ThreadMessage,
  ThreadVoiceNoteItem,
} from "@/lib/types/thread-item";
import { getPusherClient } from "@/lib/pusher-client";
import { threadChannel } from "@/lib/pusher-channels";
import { VoiceMessageRecorder } from "./voice-message-recorder";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Message = ThreadMessage;

/** Fields a realtime edit/delete event can change on an already-rendered message. */
type MessagePatch = Pick<Message, "content" | "editedAt" | "deletedAt">;

/** Segmented filter above the thread — purely local view state, no URL param. */
type ItemFilter = "all" | "messages" | "voice_notes";

const ITEM_FILTERS: { key: ItemFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "voice_notes", label: "Voice Notes" },
];

interface MessageThreadProps {
  /** Chat messages and workout voice notes, already interleaved by createdAt. */
  items: ThreadItem[];
  currentUserId: string;
  recipientId: string;
  recipientName: string;
  /** Renders a "Message" / "Note (internal)" composer switch — trainer-only. */
  allowInternalNotes?: boolean;
  /** Extra content rendered on the right side of the thread header. */
  headerRight?: React.ReactNode;
}

export function MessageThread({
  items: initialItems,
  currentUserId,
  recipientId,
  recipientName,
  allowInternalNotes = false,
  headerRight,
}: MessageThreadProps) {
  const [items, setItems] = useState<ThreadItem[]>(initialItems);
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [composeMode, setComposeMode] = useState<"message" | "note">("message");

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleItems = useMemo(() => {
    if (filter === "all") return items;
    const wanted = filter === "messages" ? "message" : "voice_note";
    return items.filter((item) => item.kind === wanted);
  }, [items, filter]);

  const hasVoiceNotes = useMemo(
    () => items.some((item) => item.kind === "voice_note"),
    [items],
  );

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleItems.length, recipientTyping]);

  /** Applies a realtime patch to one message item, leaving voice notes untouched. */
  const patchMessage = useCallback((id: string, patch: Partial<MessagePatch>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.kind === "message" && item.id === id ? { ...item, ...patch } : item,
      ),
    );
  }, []);

  const appendMessage = useCallback((message: Message) => {
    setItems((prev) =>
      prev.some((item) => item.kind === "message" && item.id === message.id)
        ? prev
        : [...prev, { kind: "message" as const, ...message }],
    );
  }, []);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(threadChannel(currentUserId, recipientId));

    channel.bind(
      "new-message",
      (data: Omit<Message, "createdAt"> & { createdAt: string }) => {
        const msg: Message = { ...data, createdAt: new Date(data.createdAt) };
        appendMessage(msg);
        setRecipientTyping(false);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);

        // Immediately mark as read — user is actively viewing this thread
        if (msg.senderId === recipientId) {
          markMessagesReadAction(recipientId).catch(() => {});
        }
      },
    );

    channel.bind(
      "message-updated",
      (data: { id: string; content: string; editedAt: string | null; deletedAt: string | null }) => {
        patchMessage(data.id, {
          content: data.content,
          editedAt: data.editedAt ? new Date(data.editedAt) : null,
          deletedAt: data.deletedAt ? new Date(data.deletedAt) : null,
        });
      },
    );

    channel.bind("messages-read", (data: { readByUserId: string }) => {
      if (data.readByUserId !== recipientId) return;
      const now = new Date();
      setItems((prev) =>
        prev.map((item) =>
          item.kind === "message" && item.senderId === currentUserId && !item.isRead
            ? { ...item, isRead: true, readAt: now }
            : item,
        ),
      );
    });

    channel.bind("client-typing", (data: { userId: string }) => {
      if (data.userId !== recipientId) return;
      setRecipientTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setRecipientTyping(false), 2000);
    });

    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      pusher.unsubscribe(threadChannel(currentUserId, recipientId));
    };
  }, [currentUserId, recipientId, appendMessage, patchMessage]);

  const triggerTyping = useCallback(() => {
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      const ch = getPusherClient().channel(threadChannel(currentUserId, recipientId));
      ch?.trigger("client-typing", { userId: currentUserId });
    }, 300);
  }, [currentUserId, recipientId]);

  async function handleSend() {
    if (!content.trim()) return;
    const isInternal = allowInternalNotes && composeMode === "note";
    setSending(true);
    const result = await sendMessageAction({ recipientId, content: content.trim(), isInternal });
    setSending(false);
    if (result.success) {
      setContent("");
      // Internal notes are never broadcast over the shared thread channel
      // (the client is subscribed to it), so append it here instead of
      // waiting for a Pusher echo that will never arrive.
      if (isInternal) {
        appendMessage(result.data);
      }
    } else {
      toast.error(result.error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const recipientInitials = recipientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="font-semibold text-foreground">{recipientName}</h2>
        {headerRight}
      </div>

      {/* Filter: chat messages vs. voice notes left against a workout.
          Only offered once the thread actually contains both kinds. */}
      {hasVoiceNotes && (
        <div className="flex shrink-0 gap-1 border-b border-border px-4 py-2">
          {ITEM_FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === option.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1 p-4">
        <div className="space-y-4">
          {visibleItems.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing to show for this filter.
            </p>
          )}

          {visibleItems.map((item) =>
            item.kind === "voice_note" ? (
              <VoiceNoteBubble
                key={`voice-${item.id}`}
                item={item}
                isOwn={item.authorId === currentUserId}
              />
            ) : (
              <MessageBubble
                key={item.id}
                message={item}
                isOwn={item.senderId === currentUserId}
                onPatch={patchMessage}
              />
            ),
          )}

          {/* Typing indicator */}
          {recipientTyping && (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-muted text-xs">{recipientInitials}</AvatarFallback>
              </Avatar>
              <div className="inline-flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4">
        {allowInternalNotes && !showRecorder && (
          <div className="mb-2 flex gap-1">
            {(["message", "note"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setComposeMode(mode)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  composeMode === mode
                    ? mode === "note"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode === "message" ? "Message" : "Note (internal)"}
              </button>
            ))}
          </div>
        )}
        {showRecorder ? (
          <VoiceMessageRecorder
            recipientId={recipientId}
            onSent={() => setShowRecorder(false)}
            onCancel={() => setShowRecorder(false)}
          />
        ) : (
          <div className="flex gap-2">
            <Textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                triggerTyping();
              }}
              onKeyDown={handleKeyDown}
              placeholder={composeMode === "note" ? "Write a note only you can see..." : "Type a message..."}
              rows={1}
              className={`min-h-[2.5rem] resize-none ${composeMode === "note" ? "border-amber-300 bg-amber-50" : ""}`}
            />
            {composeMode === "message" && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowRecorder(true)}
                aria-label="Record a voice note"
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
            <Button onClick={handleSend} disabled={sending || !content.trim()} size="icon">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A `VoiceMemo` recorded against a workout. Visually mirrors the in-thread
 * voice-message bubble so the thread reads consistently, but is labelled and
 * deep-linked to the session it belongs to — these are workout notes, not chat.
 */
function VoiceNoteBubble({ item, isOwn }: { item: ThreadVoiceNoteItem; isOwn: boolean }) {
  const initials = item.author
    ? `${item.author.firstName[0] ?? ""}${item.author.lastName[0] ?? ""}`
    : "?";

  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={item.author?.imageUrl || undefined} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className={`max-w-[70%] ${isOwn ? "text-right" : ""}`}>
        <div
          className={`inline-block rounded-lg px-3 py-2 text-left ${
            isOwn ? "bg-blue-600 text-white" : "bg-muted text-foreground"
          }`}
        >
          <p
            className={`mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${
              isOwn ? "text-white/80" : "text-muted-foreground"
            }`}
          >
            <Dumbbell className="h-3 w-3 shrink-0" />
            Session Voice Note
          </p>
          <p className={`mb-1.5 text-xs ${isOwn ? "text-white/90" : "text-muted-foreground"}`}>
            {item.workoutName}
          </p>
          <div className="flex items-center gap-2">
            <Mic className={`h-3.5 w-3.5 shrink-0 ${isOwn ? "text-white" : "text-muted-foreground"}`} />
            <audio src={item.audioUrl} controls className="h-8 max-w-[220px]" />
          </div>
          {item.sessionId && (
            <Link
              href={`/sessions/${item.sessionId}`}
              className={`mt-1.5 inline-block text-xs font-medium underline underline-offset-2 ${
                isOwn ? "text-white/90 hover:text-white" : "text-primary hover:text-primary/80"
              }`}
            >
              View workout
            </Link>
          )}
        </div>

        <div
          className={`mt-1 flex items-center gap-1 text-xs text-muted-foreground/60 ${
            isOwn ? "justify-end" : ""
          }`}
        >
          <span>{formatRelativeTime(item.createdAt)}</span>
          {isOwn && <ReadIndicator isRead={item.isRead} />}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  onPatch,
}: {
  message: Message;
  isOwn: boolean;
  onPatch: (id: string, patch: Partial<MessagePatch>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDeleted = !!message.deletedAt;
  const isVoice = !!message.audioUrl;
  // Voice notes have no editable text; deleted messages lose all affordances.
  const canEdit = isOwn && !isDeleted && !isVoice;
  const canDelete = isOwn && !isDeleted;
  const hasQuote = !!message.replyToExerciseName && !!message.replyToNoteExcerpt;

  function startEditing() {
    setDraft(message.content);
    setEditing(true);
  }

  async function handleSave() {
    const next = draft.trim();
    if (!next) {
      toast.error("Message cannot be empty");
      return;
    }
    if (next === message.content) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await editMessageAction(message.id, next);
    setSaving(false);

    if (result.success) {
      onPatch(message.id, { content: next, editedAt: result.data.editedAt ?? new Date() });
      setEditing(false);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteMessageAction(message.id);
    setDeleting(false);
    setConfirmingDelete(false);

    if (result.success) {
      onPatch(message.id, { content: "", deletedAt: result.data.deletedAt ?? new Date() });
    } else {
      toast.error(result.error);
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  }

  return (
    <div className={`group flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={message.sender.imageUrl || undefined} />
        <AvatarFallback className="text-xs">
          {message.sender.firstName[0]}
          {message.sender.lastName[0]}
        </AvatarFallback>
      </Avatar>

      <div className={`max-w-[70%] ${isOwn ? "text-right" : ""}`}>
        {/* Quoted client note this message is replying to */}
        {hasQuote && !isDeleted && (
          <div className="mb-1 rounded border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-left text-xs">
            <p className="font-semibold text-muted-foreground">
              {message.replyToExerciseName}
            </p>
            <p className="italic text-muted-foreground/80">{message.replyToNoteExcerpt}</p>
          </div>
        )}

        {isDeleted ? (
          <div className="inline-block rounded-lg px-4 py-2 text-sm italic text-muted-foreground ring-1 ring-border">
            This message was deleted
          </div>
        ) : editing ? (
          <div className="space-y-2 text-left">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
              rows={2}
              autoFocus
              className="min-h-[3rem] resize-none text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !draft.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ) : isVoice ? (
          <div
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${
              isOwn ? "bg-blue-600" : "bg-muted"
            }`}
          >
            <Mic
              className={`h-3.5 w-3.5 shrink-0 ${isOwn ? "text-white" : "text-muted-foreground"}`}
            />
            <audio src={message.audioUrl ?? undefined} controls className="h-8 max-w-[220px]" />
          </div>
        ) : (
          <div>
            {message.isInternal && (
              <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ${isOwn ? "text-right" : ""}`}>
                Internal note
              </p>
            )}
            <div
              className={`inline-block rounded-lg px-4 py-2 text-sm ${
                message.isInternal
                  ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300"
                  : isOwn
                    ? "bg-blue-600 text-white"
                    : "bg-muted text-foreground"
              }`}
            >
              {message.content}
            </div>
          </div>
        )}

        <div
          className={`mt-1 flex items-center gap-1 text-xs text-muted-foreground/60 ${
            isOwn ? "justify-end" : ""
          }`}
        >
          <span>{formatRelativeTime(message.createdAt)}</span>
          {message.editedAt && !isDeleted && <span>(edited)</span>}
          {isOwn && <ReadIndicator isRead={!!message.isRead} readAt={message.readAt} />}
        </div>
      </div>

      {(canEdit || canDelete) && !editing && (
        <>
          <DropdownMenu>
            {/* base-ui triggers do not support asChild — the icon is passed as children. */}
            <DropdownMenuTrigger
              className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Message actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "start" : "end"}>
              {canEdit && (
                <DropdownMenuItem onClick={startEditing}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Rendered as a sibling rather than nested in the menu so closing the
              dropdown does not unmount the confirmation. */}
          <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete message?</AlertDialogTitle>
                <AlertDialogDescription>
                  This message will be replaced with &ldquo;This message was deleted&rdquo; for
                  both you and the recipient. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  variant="destructive"
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function ReadIndicator({ isRead, readAt }: { isRead: boolean; readAt?: Date | string | null }) {
  if (!isRead) {
    return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
  }

  const readLabel = readAt
    ? `Read ${new Date(readAt).toLocaleString()}`
    : "Read";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex items-center" aria-label={readLabel} />}
        >
          <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
        </TooltipTrigger>
        <TooltipContent>{readLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
