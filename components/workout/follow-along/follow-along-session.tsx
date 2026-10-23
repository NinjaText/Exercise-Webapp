"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, MessageSquareText, Play, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { startSessionV2Action, completeFollowAlongSessionAction } from "@/actions/session-v2-actions";
import { getYouTubeThumbnail } from "@/lib/utils/video";
import {
  formatDayOfTotal,
  formatDuration,
  getFeelingLabel,
  getYouTubeVideoId,
  type FeelingRating,
} from "@/lib/utils/follow-along";
import { FollowAlongPlayer } from "./follow-along-player";
import { FollowAlongFeedbackDialog } from "./follow-along-feedback-dialog";

interface FollowAlongSessionProps {
  session: {
    id: string;
    status: string;
    feelingRating: string | null;
    overallNotes: string | null;
  };
  workout: {
    name: string;
    description: string | null;
    videoUrl: string;
    videoDurationSec: number | null;
  };
  /** 1-based day within a follow-along program; null for a one-off video workout. */
  dayNumber: number | null;
  totalDays: number | null;
  trainerName: string | null;
  /** Only the client who owns the session can start it — the trainer gets a read-only preview. */
  canStart: boolean;
  canMessageTrainer: boolean;
}

type Stage = "overview" | "playing" | "feedback";

/**
 * The client's follow-along experience on /sessions/[id]: a pre-screen
 * ("Day 12 of 90", video, trainer notes, Start session) → a full-screen player
 * with a countdown → the "How did it go?" dialog that completes the session.
 */
export function FollowAlongSession({
  session,
  workout,
  dayNumber,
  totalDays,
  trainerName,
  canStart,
  canMessageTrainer,
}: FollowAlongSessionProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("overview");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [endedEarly, setEndedEarly] = useState(false);
  const watchedSecondsRef = useRef(0);
  const videoEndedRef = useRef(false);
  const isCompleted = session.status === "COMPLETED";
  // A completed session can be re-watched, but finishing it again records nothing.
  const replayRef = useRef(false);

  const youTubeId = getYouTubeVideoId(workout.videoUrl);
  const durationLabel = formatDuration(workout.videoDurationSec);
  const feelingLabel = getFeelingLabel(session.feelingRating);

  async function handleStart() {
    replayRef.current = isCompleted;
    watchedSecondsRef.current = 0;
    if (!isCompleted && session.status !== "IN_PROGRESS") {
      setStarting(true);
      const result = await startSessionV2Action(session.id);
      setStarting(false);
      if (!result.success) {
        toast.error(result.error ?? "Couldn't start the session");
        return;
      }
    }
    setStage("playing");
  }

  const handleFinish = useCallback(
    ({
      watchedSeconds,
      endedEarly: early,
      videoEnded,
    }: {
      watchedSeconds: number;
      endedEarly: boolean;
      videoEnded: boolean;
    }) => {
      watchedSecondsRef.current = watchedSeconds;
      videoEndedRef.current = videoEnded;
      if (replayRef.current) {
        setStage("overview");
        return;
      }
      setEndedEarly(early);
      setStage("feedback");
    },
    []
  );

  async function complete(answer: { feelingRating: FeelingRating | null; comment: string } | null) {
    setSubmitting(true);
    const result = await completeFollowAlongSessionAction({
      sessionId: session.id,
      feelingRating: answer?.feelingRating ?? null,
      comment: answer?.comment.trim() || null,
      watchedSeconds: Math.round(watchedSecondsRef.current),
      videoEnded: videoEndedRef.current,
    });
    if (!result.success) {
      setSubmitting(false);
      toast.error(result.error ?? "Couldn't save your session");
      return;
    }
    // Already completed (another tab / double submit) is still "done" for the client.
    toast.success(
      result.data.alreadyCompleted
        ? "This session was already complete"
        : result.data.messageSent
          ? "Session complete — sent to your trainer"
          : "Session complete"
    );
    router.push("/dashboard");
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-surface shadow-xs ring-1 ring-border">
        {dayNumber != null && (
          <div className="space-y-2 border-b border-border px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-label text-foreground">{formatDayOfTotal(dayNumber, totalDays)}</p>
              {totalDays ? (
                <span className="text-caption tabular-nums">{Math.round((dayNumber / totalDays) * 100)}%</span>
              ) : null}
            </div>
            {totalDays ? <Progress value={Math.min(100, (dayNumber / totalDays) * 100)} /> : null}
          </div>
        )}

        <button
          type="button"
          onClick={canStart ? handleStart : undefined}
          disabled={!canStart || starting}
          aria-label={canStart ? `Play ${workout.name}` : undefined}
          className="group relative block aspect-video w-full overflow-hidden bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          {youTubeId ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, not worth an image-domain config
            <img src={getYouTubeThumbnail(youTubeId)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          ) : (
            // #t=0.5 makes browsers paint a real frame as the poster instead of black.
            <video src={`${workout.videoUrl}#t=0.5`} preload="metadata" muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-80" />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-black/60 transition-transform group-hover:scale-105 motion-reduce:transition-none">
              {starting ? <Loader2 className="size-7 animate-spin" /> : <Play className="ml-1 size-7 fill-current" />}
            </span>
          </span>
          {durationLabel && (
            <span className="absolute right-3 bottom-3 rounded-md bg-black/70 px-2 py-0.5 text-caption font-medium text-white tabular-nums">
              {durationLabel}
            </span>
          )}
        </button>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            <span className="inline-flex items-center gap-1">
              <PlayCircle className="size-3.5" aria-hidden />
              Follow-along video
            </span>
            {durationLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {durationLabel}
              </span>
            )}
            {isCompleted && <StatusBadge status="COMPLETED" />}
          </div>

          {canStart && (
            <Button className="h-11 w-full sm:w-auto" onClick={handleStart} disabled={starting}>
              {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
              {isCompleted ? "Watch again" : session.status === "IN_PROGRESS" ? "Resume session" : "Start session"}
            </Button>
          )}

          {isCompleted && (feelingLabel || session.overallNotes) && (
            <div className="flex items-start gap-2 rounded-lg bg-success-soft p-3 text-body text-success-foreground ring-1 ring-success-border">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 space-y-0.5">
                {feelingLabel && <p className="font-medium">Felt: {feelingLabel}</p>}
                {session.overallNotes && <p className="break-words">{session.overallNotes}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {workout.description && (
        <SectionCard title={trainerName ? `Notes from ${trainerName}` : "Trainer notes"} icon={MessageSquareText} size="compact">
          <p className="whitespace-pre-line text-body">{workout.description}</p>
        </SectionCard>
      )}

      {stage === "playing" && (
        <FollowAlongPlayer
          title={workout.name}
          subtitle={dayNumber != null ? formatDayOfTotal(dayNumber, totalDays) : null}
          videoUrl={workout.videoUrl}
          durationSec={workout.videoDurationSec}
          onFinish={handleFinish}
          onExit={() => {
            setStage("overview");
            // The session was started; refresh so the CTA reads "Resume session".
            router.refresh();
          }}
        />
      )}

      <FollowAlongFeedbackDialog
        open={stage === "feedback"}
        endedEarly={endedEarly}
        canMessageTrainer={canMessageTrainer}
        submitting={submitting}
        onSubmit={(answer) => complete(answer)}
        onSkip={() => complete(null)}
      />
    </>
  );
}

