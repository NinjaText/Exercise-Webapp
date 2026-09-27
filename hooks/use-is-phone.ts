import { useSyncExternalStore } from "react";

// Touch-first device without hover (phones and tablets, including the native shell)…
const TOUCH_QUERY = "(pointer: coarse) and (hover: none)";
// …whose shorter screen side is phone-sized, so tablets are excluded in either orientation.
const PHONE_MAX_SHORT_SIDE = 600;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(TOUCH_QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getSnapshot() {
  return (
    window.matchMedia(TOUCH_QUERY).matches &&
    Math.min(window.screen.width, window.screen.height) < PHONE_MAX_SHORT_SIDE
  );
}

/** True on phones (mobile web and the native app). Always false during SSR. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Below Tailwind's `sm` breakpoint (640 px). */
export const PHONE_QUERY = "(max-width: 639.98px)";

export function subscribeToPhoneQuery(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function getPhoneSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

export function getPhoneServerSnapshot(): boolean {
  return false;
}

/**
 * True on phone-width viewports (below `sm`), whatever the device — unlike
 * `useIsPhone`, which asks whether the device itself is a touch phone. Use this
 * where behaviour must match the `sm:` layout classes (e.g. phone-only menu
 * items, turning off drag where the phone layout shows). False on the server
 * and during hydration; gate layout itself with `sm:` classes so nothing flashes.
 */
export function useIsPhoneViewport(): boolean {
  return useSyncExternalStore(subscribeToPhoneQuery, getPhoneSnapshot, getPhoneServerSnapshot);
}
