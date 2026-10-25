"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { getYouTubeVideoId } from "@/lib/utils/follow-along";
import {
  loadYouTubeIframeApi,
  YOUTUBE_PLAYER_STATE,
  type YouTubePlayer,
} from "@/lib/utils/youtube-iframe-api";
import { cn } from "@/lib/utils";

/** Imperative controls shared by both sources, so the player screen never branches on the provider. */
export interface FollowAlongVideoHandle {
  play(): void;
  pause(): void;
  getCurrentTime(): number;
}

interface FollowAlongVideoProps {
  url: string;
  ref?: Ref<FollowAlongVideoHandle>;
  /** Try to start as soon as the media is ready (browsers may still block unmuted autoplay). */
  autoPlay?: boolean;
  /** Fires once with the media's real duration in seconds, when known. */
  onReady?: (durationSec: number | null) => void;
  /** Polled roughly twice a second with the playhead position. */
  onTime?: (currentSec: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
  /**
   * YouTube only: true when a play request didn't start playback. iOS Safari
   * drops the user gesture across an awaited action and blocks postMessage
   * playVideo() until the iframe itself is tapped — the screen then asks the
   * client to tap the video (nothing may cover the iframe).
   */
  onNeedsTap?: (needsTap: boolean) => void;
  className?: string;
}

// How long a play request gets to reach PLAYING before we ask for a tap.
const PLAY_START_GRACE_MS = 1200;

const TICK_MS = 500;

/**
 * One player for both follow-along sources: an HTML5 <video> for R2 uploads,
 * the YouTube IFrame API for YouTube links. Native/YouTube controls are hidden
 * — the follow-along screen owns play/pause/stop and the countdown.
 */
export function FollowAlongVideo(props: FollowAlongVideoProps) {
  const youTubeId = getYouTubeVideoId(props.url);
  return youTubeId ? <YouTubeSource {...props} videoId={youTubeId} /> : <Html5Source {...props} />;
}

function Html5Source({ url, ref, autoPlay, onReady, onTime, onPlayingChange, onEnded, onError, className }: FollowAlongVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      // play() rejects when the browser blocks it; the screen then just shows "Play".
      videoRef.current?.play().catch(() => onPlayingChange?.(false));
    },
    pause: () => videoRef.current?.pause(),
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
  }));

  useEffect(() => {
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) onTime?.(video.currentTime);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [onTime]);

  return (
    <video
      ref={videoRef}
      src={url}
      className={cn("h-full w-full object-contain", className)}
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => {
        const duration = e.currentTarget.duration;
        onReady?.(Number.isFinite(duration) ? Math.round(duration) : null);
        if (autoPlay) e.currentTarget.play().catch(() => onPlayingChange?.(false));
      }}
      onPlay={() => onPlayingChange?.(true)}
      onPause={() => onPlayingChange?.(false)}
      onEnded={() => {
        onPlayingChange?.(false);
        onEnded?.();
      }}
      onError={() => onError?.("This video couldn't be played.")}
    />
  );
}

function YouTubeSource({
  videoId,
  ref,
  autoPlay,
  onReady,
  onTime,
  onPlayingChange,
  onEnded,
  onError,
  onNeedsTap,
  className,
}: FollowAlongVideoProps & { videoId: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const startCheckRef = useRef<number | null>(null);
  // Latest callbacks without re-creating the player when a parent re-renders.
  const callbacks = useRef({ onReady, onPlayingChange, onEnded, onError, onNeedsTap });
  useEffect(() => {
    callbacks.current = { onReady, onPlayingChange, onEnded, onError, onNeedsTap };
  });

  // After asking to play, check the player actually started; if not, the
  // browser wants a real tap on the iframe.
  const checkPlaybackStarted = useCallback(() => {
    if (startCheckRef.current) window.clearTimeout(startCheckRef.current);
    startCheckRef.current = window.setTimeout(() => {
      const state = playerRef.current?.getPlayerState?.();
      if (state !== YOUTUBE_PLAYER_STATE.PLAYING && state !== YOUTUBE_PLAYER_STATE.BUFFERING) {
        callbacks.current.onNeedsTap?.(true);
      }
    }, PLAY_START_GRACE_MS);
  }, []);

  useEffect(() => () => {
    if (startCheckRef.current) window.clearTimeout(startCheckRef.current);
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => {
      playerRef.current?.playVideo();
      checkPlaybackStarted();
    },
    pause: () => playerRef.current?.pauseVideo(),
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
  }));

  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;
    // The API replaces the element it's given, so hand it a disposable child.
    const target = document.createElement("div");
    mount.appendChild(target);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          host: "https://www.youtube-nocookie.com",
          playerVars: { autoplay: autoPlay ? 1 : 0, controls: 0, rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: ({ target: player }) => {
              const duration = player.getDuration();
              callbacks.current.onReady?.(duration > 0 ? Math.round(duration) : null);
              if (autoPlay) checkPlaybackStarted();
            },
            onStateChange: ({ data }) => {
              if (data === YOUTUBE_PLAYER_STATE.PLAYING) {
                callbacks.current.onNeedsTap?.(false);
                callbacks.current.onPlayingChange?.(true);
              }
              if (data === YOUTUBE_PLAYER_STATE.PAUSED) callbacks.current.onPlayingChange?.(false);
              if (data === YOUTUBE_PLAYER_STATE.ENDED) {
                callbacks.current.onPlayingChange?.(false);
                callbacks.current.onEnded?.();
              }
            },
            onError: () => callbacks.current.onError?.("This YouTube video can't be played here."),
          },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) callbacks.current.onError?.(error instanceof Error ? error.message : "Couldn't load the video");
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.replaceChildren();
    };
  }, [videoId, autoPlay, checkPlaybackStarted]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (player && player.getPlayerState?.() === YOUTUBE_PLAYER_STATE.PLAYING) onTime?.(player.getCurrentTime());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [onTime]);

  return <div ref={mountRef} className={cn("h-full w-full [&_iframe]:h-full [&_iframe]:w-full", className)} />;
}
