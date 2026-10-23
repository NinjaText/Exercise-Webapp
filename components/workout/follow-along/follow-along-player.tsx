"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize, Minimize, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatClock } from "@/lib/utils/follow-along";
import { FollowAlongVideo, type FollowAlongVideoHandle } from "./follow-along-video";

interface FollowAlongPlayerProps {
  title: string;
  subtitle?: string | null;
  videoUrl: string;
  /** Trainer-entered length; replaced by the media's own duration once it loads. */
  durationSec: number | null;
  onFinish: (result: { watchedSeconds: number; endedEarly: boolean; videoEnded: boolean }) => void;
  /** Leave the player without finishing — the session stays in progress. */
  onExit: () => void;
}

// A playhead jump bigger than this between polls is a seek or a stall, not
// playback — it doesn't count toward "seconds actually watched".
const MAX_COUNTED_STEP_SEC = 2;

/**
 * Full-screen follow-along overlay: title + countdown on top, the video in the
 * middle, play/pause and stop at the bottom. Stop asks for confirmation, then
 * ends the session early; the video ending finishes it normally.
 */
export function FollowAlongPlayer({ title, subtitle, videoUrl, durationSec, onFinish, onExit }: FollowAlongPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<FollowAlongVideoHandle>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [mediaDurationSec, setMediaDurationSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  // Bumped by "Retry" to remount the video after a load/playback error.
  const [attempt, setAttempt] = useState(0);
  // Nothing played yet → stopping leaves without completing (nothing to rate).
  const [hasWatched, setHasWatched] = useState(false);
  const watchedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const finishedRef = useRef(false);

  const totalSec = mediaDurationSec ?? durationSec;
  const remainingSec = totalSec != null ? Math.max(0, totalSec - currentSec) : null;
  const progressPercent = totalSec ? Math.min(100, (currentSec / totalSec) * 100) : 0;

  // Keep the page behind the overlay from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const trackTime = useCallback((t: number) => {
    const step = t - lastTimeRef.current;
    if (step > 0 && step <= MAX_COUNTED_STEP_SEC) watchedRef.current += step;
    lastTimeRef.current = t;
    if (watchedRef.current >= 1) setHasWatched(true);
    setCurrentSec(t);
  }, []);

  const leave = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    onExit();
  }, [onExit]);

  const finish = useCallback(
    (endedEarly: boolean) => {
      if (finishedRef.current) return;
      // Count the tail between the last poll and the end/stop.
      trackTime(videoRef.current?.getCurrentTime() ?? lastTimeRef.current);
      const watchedSeconds = Math.round(watchedRef.current);
      const videoEnded = !endedEarly;
      // Never complete a session nothing was watched of (the server refuses too).
      if (watchedSeconds === 0 && !videoEnded) {
        leave();
        return;
      }
      finishedRef.current = true;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      onFinish({ watchedSeconds, endedEarly, videoEnded });
    },
    [onFinish, trackTime, leave]
  );

  const togglePlay = useCallback(() => {
    if (playing) videoRef.current?.pause();
    else videoRef.current?.play();
  }, [playing]);

  function requestStop() {
    videoRef.current?.pause();
    // Dialogs portal to <body>, which native fullscreen would hide.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    setConfirmStop(true);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else containerRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || confirmStop) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, textarea")) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, confirmStop]);

  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — follow-along video`}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label">{title}</p>
          {subtitle && <p className="truncate text-caption text-white/70">{subtitle}</p>}
        </div>
        <div className="text-right" aria-live="off">
          <p className="text-heading font-semibold tabular-nums">{remainingSec != null ? formatClock(remainingSec) : "--:--"}</p>
          <p className="text-caption text-white/70">remaining</p>
        </div>
        {canFullscreen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-white hover:bg-white/10 hover:text-white"
            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </Button>
        )}
      </div>
      <div className="h-1 w-full bg-white/15" aria-hidden>
        <div className="h-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="relative min-h-0 flex-1">
        <FollowAlongVideo
          key={attempt}
          ref={videoRef}
          url={videoUrl}
          autoPlay
          onReady={setMediaDurationSec}
          onTime={trackTime}
          onPlayingChange={setPlaying}
          onEnded={() => finish(false)}
          onError={setError}
          onNeedsTap={setNeedsTap}
        />
        {needsTap && !playing && !error && (
          // pointer-events-none: the tap has to land on the YouTube iframe itself.
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <p className="rounded-full bg-black/75 px-4 py-2 text-label">Tap the video to start</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
            <p className="text-body">{error}</p>
            <p className="text-caption text-white/70">Your session is still open — you can come back to it.</p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={leave}
                className="text-white ring-1 ring-white/30 hover:bg-white/10 hover:text-white"
              >
                Back
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setNeedsTap(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button
          variant="ghost"
          onClick={requestStop}
          className="h-12 gap-2 rounded-full px-5 text-white ring-1 ring-white/30 hover:bg-white/10 hover:text-white"
        >
          <Square className="size-4 fill-current" />
          Stop
        </Button>
        <Button
          onClick={togglePlay}
          disabled={!!error}
          className="size-16 rounded-full bg-white text-black hover:bg-white/90"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-7 fill-current" /> : <Play className="ml-1 size-7 fill-current" />}
        </Button>
        {/* Balances the Stop button so play/pause sits dead centre. */}
        <span className="h-12 w-[5.5rem]" aria-hidden />
      </div>

      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title={hasWatched ? "End this session?" : "Leave without starting?"}
        description={
          hasWatched
            ? "You'll be asked how it went, and the session is marked complete with the time you watched."
            : "Nothing has played yet, so nothing is saved — the session stays open for later."
        }
        confirmLabel={hasWatched ? "End session" : "Leave"}
        cancelLabel="Keep going"
        onConfirm={() => finish(true)}
      />
    </div>,
    document.body
  );
}
