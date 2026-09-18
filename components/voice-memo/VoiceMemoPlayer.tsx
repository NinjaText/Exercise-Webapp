"use client"

import { useRef, useState, useEffect } from "react"
import { Play, Pause, Mic, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { markVoiceMemoRead } from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatRelative(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface VoiceMemoPlayerProps {
  memo: VoiceMemoData
  authorName: string
}

export function VoiceMemoPlayer({ memo, authorName }: VoiceMemoPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasPlayed, setHasPlayed] = useState(memo.isRead)
  const isTrainer = memo.authorRole === "TRAINER"

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTimeUpdate = () =>
      setProgress((audio.currentTime / (audio.duration || 1)) * 100)
    const onEnded = () => setPlaying(false)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("ended", onEnded)
    }
  }, [])

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      await audio.play()
      setPlaying(true)
      if (!hasPlayed) {
        setHasPlayed(true)
        markVoiceMemoRead(memo.id).catch(() => {})
      }
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isTrainer ? "bg-success-soft" : "bg-info-soft"
        }`}
      >
        {isTrainer ? (
          <Mic className="h-4 w-4 text-success-foreground" />
        ) : (
          <User className="h-4 w-4 text-info-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{authorName}</span>
          <Badge
            variant="outline"
            className={`px-1.5 py-0 text-[10px] ${
              isTrainer
                ? "border-success-border text-success-foreground"
                : "border-info-border text-info-foreground"
            }`}
          >
            {isTrainer ? "Trainer" : "Client"}
          </Badge>
          {!hasPlayed && (
            <span className="h-2 w-2 rounded-full bg-info" />
          )}
        </div>
        <div
          className="mt-1.5 h-1.5 w-full cursor-pointer rounded-full bg-muted"
          onClick={seek}
        >
          <div
            className={`h-full rounded-full transition-all ${
              isTrainer ? "bg-success" : "bg-info"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {formatDuration(memo.durationSec)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatRelative(memo.createdAt)}
          </span>
        </div>
      </div>
      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={togglePlay}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <audio ref={audioRef} src={memo.r2Url} preload="metadata" />
    </div>
  )
}
