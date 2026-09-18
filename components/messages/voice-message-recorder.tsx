"use client";

import { useRef, useState, useEffect } from "react";
import { Square, Send, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useVoiceMessageUpload } from "@/hooks/use-voice-message-upload";

const MAX_DURATION_SEC = 120;

interface VoiceMessageRecorderProps {
  recipientId: string;
  onSent: () => void;
  onCancel: () => void;
}

export function VoiceMessageRecorder({ recipientId, onSent, onCancel }: VoiceMessageRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const { upload, uploadState, error } = useVoiceMessageUpload();
  const uploading = uploadState === "uploading" || uploadState === "confirming";

  useEffect(() => {
    // `cancelled` must be local to THIS effect invocation, not a ref — React's
    // dev-mode Strict Mode double-invoke (mount → cleanup → mount) reuses the
    // same component instance, so a shared ref gets reset by the second mount
    // before the first mount's pending getUserMedia() promise ever checks it.
    // That was the bug: both "phantom" and real recorders survived and wrote
    // into the same chunksRef, silently duplicating every chunk of audio.
    let cancelled = false;
    startRecording(() => cancelled);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        mr.ondataavailable = null;
        mr.onstop = null;
        mr.stream.getTracks().forEach((t) => t.stop());
        mr.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function startRecording(isCancelled: () => boolean) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (isCancelled()) {
        // Effect was already cleaned up before the permission prompt resolved —
        // release this stream immediately instead of letting it record unseen.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= MAX_DURATION_SEC) {
            stopRecording();
            return MAX_DURATION_SEC;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      if (!isCancelled()) {
        toast.error("Microphone access denied. Allow microphone permissions and try again.");
        onCancel();
      }
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function discard() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    onCancel();
  }

  async function submit() {
    if (!audioBlob) return;
    const durationSec = Math.max(1, elapsed);
    const ok = await upload(recipientId, audioBlob, "webm", Math.min(durationSec, MAX_DURATION_SEC));
    if (ok) {
      onSent();
    } else {
      toast.error(error ?? "Failed to send voice note");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      {recording ? (
        <>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-sm font-medium text-danger-foreground">Recording… {formatTime(elapsed)}</span>
          <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs" onClick={stopRecording}>
            <Square className="h-3 w-3" />
            Stop
          </Button>
        </>
      ) : (
        <>
          <audio src={audioUrl ?? undefined} controls className="h-8 flex-1 min-w-0" />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={discard} disabled={uploading}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={submit} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send
          </Button>
        </>
      )}
    </div>
  );
}
