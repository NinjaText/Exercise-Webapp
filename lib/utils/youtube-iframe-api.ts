/**
 * Browser-only loader for the YouTube IFrame Player API.
 *
 * The plain embed iframe can't report the current time or tell us when the
 * video ends, and follow-along needs both (countdown timer, "How did it go?"
 * on end, auto-reading a pasted video's duration). The API script is loaded
 * once per page and shared by every player.
 */

/** The slice of YT.Player the app uses. */
export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export interface YouTubePlayerEvents {
  onReady?: (event: { target: YouTubePlayer }) => void;
  onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
  onError?: (event: { data: number }) => void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: YouTubePlayerEvents;
    }
  ) => YouTubePlayer;
}

/** YT.PlayerState values. */
export const YOUTUBE_PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
} as const;

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";
const LOAD_TIMEOUT_MS = 15_000;

let apiPromise: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("YouTube API is browser-only"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      apiPromise = null;
      reject(new Error("Timed out loading the YouTube player"));
    }, LOAD_TIMEOUT_MS);

    // The API calls this global when ready; chain any handler someone else set.
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API loaded without a Player"));
    };

    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = API_SRC;
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        apiPromise = null;
        reject(new Error("Couldn't load the YouTube player"));
      };
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

/**
 * Reads a YouTube video's length by spinning up a hidden player. Resolves
 * null when it can't tell (embedding disabled, API blocked, timeout) so
 * callers fall back to a manually entered duration.
 */
export async function readYouTubeDuration(videoId: string, timeoutMs = 10_000): Promise<number | null> {
  let YT: YouTubeNamespace;
  try {
    YT = await loadYouTubeIframeApi();
  } catch {
    return null;
  }

  return new Promise<number | null>((resolve) => {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:120px;pointer-events:none;";
    const target = document.createElement("div");
    host.appendChild(target);
    document.body.appendChild(host);

    let player: YouTubePlayer | null = null;
    let settled = false;
    const settle = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        player?.destroy();
      } catch {
        // The player may already be gone; nothing to clean up.
      }
      host.remove();
      resolve(value);
    };
    const timer = window.setTimeout(() => settle(null), timeoutMs);

    player = new YT.Player(target, {
      videoId,
      host: "https://www.youtube-nocookie.com",
      playerVars: { autoplay: 0, controls: 0 },
      events: {
        onReady: ({ target: ready }) => {
          const duration = ready.getDuration();
          settle(duration > 0 ? Math.round(duration) : null);
        },
        onError: () => settle(null),
      },
    });
  });
}
