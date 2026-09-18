"use client"

import { useRef, useState, useEffect } from "react"
import { Mic, Square, Upload, Send, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useVoiceMemoUpload } from "@/hooks/use-voice-memo-upload"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"

const MAX_DURATION_SEC = 300

interface VoiceMemoRecorderProps {
  workoutId: string
  role: "TRAINER" | "CLIENT"
  onSuccess: (memo: VoiceMemoData) => void
  existingMemo?: VoiceMemoData
}

export function VoiceMemoRecorder({
  workoutId,
  role,
  onSuccess,
  existingMemo,
}: VoiceMemoRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [supportsRecording] = useState(
    () => typeof window !== "undefined" && !!window.MediaRecorder
  )
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [fileExtension, setFileExtension] = useState("webm")

  const { upload, uploadState, error, reset: resetUpload } = useVoiceMemoUpload()
  const uploading = uploadState === "uploading" || uploadState === "confirming"
  const isClient = role === "CLIENT"

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" })
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setFileExtension("webm")
      }
      mr.start(1000)
      mediaRecorderRef.current = mr
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= MAX_DURATION_SEC) {
            stopRecording()
            return MAX_DURATION_SEC
          }
          return prev + 1
        })
      }, 1000)
    } catch {
      toast.error("Microphone access denied. Allow microphone permissions and try again.")
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3"
    if (!["mp3", "m4a", "wav", "webm"].includes(ext)) {
      toast.error("Please select an MP3, M4A, WAV, or WebM file.")
      return
    }
    setAudioBlob(file)
    setAudioUrl(URL.createObjectURL(file))
    setFileExtension(ext)
    setSelectedFileName(file.name)
    setElapsed(0)
  }

  function discard() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setSelectedFileName(null)
    resetUpload()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function submit() {
    if (!audioBlob) return
    // For file uploads, estimate duration from file size (rough: ~16kbps)
    const durationSec = elapsed > 0 ? elapsed : Math.max(1, Math.round(audioBlob.size / 2000))
    const memo = await upload(
      workoutId,
      audioBlob,
      fileExtension,
      Math.min(durationSec, MAX_DURATION_SEC)
    )
    if (memo) {
      toast.success("Voice note sent!")
      onSuccess(memo)
      discard()
    } else {
      toast.error(error ?? "Upload failed. Please try again.")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            isClient ? "bg-info-soft" : "bg-success-soft"
          }`}
        >
          <Mic className={`h-4 w-4 ${isClient ? "text-info-foreground" : "text-success-foreground"}`} />
        </div>
        <span className="text-sm font-semibold">
          {existingMemo ? "Replace voice note" : "Add voice note"}
        </span>
      </div>

      {!audioBlob && !recording && (
        <div className="flex flex-wrap gap-2">
          {supportsRecording && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={startRecording}
            >
              <Mic className="h-3.5 w-3.5" />
              Record
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,.webm"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-border bg-danger-soft px-4 py-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-sm font-medium text-danger-foreground">
            Recording… {formatTime(elapsed)}
          </span>
          <span className="text-xs text-danger-foreground">
            {formatTime(MAX_DURATION_SEC - elapsed)} left
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 gap-1 text-xs"
            onClick={stopRecording}
          >
            <Square className="h-3 w-3" />
            Stop
          </Button>
        </div>
      )}

      {audioBlob && !recording && (
        <div className="space-y-2.5">
          {selectedFileName && (
            <p className="truncate text-xs text-muted-foreground">{selectedFileName}</p>
          )}
          <audio src={audioUrl ?? undefined} controls className="h-9 w-full rounded-lg" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={discard}
              disabled={uploading}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5 border-0 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={submit}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {uploading ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
