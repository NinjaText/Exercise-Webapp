/**
 * Height for a full-viewport messaging pane inside the platform <main>:
 * viewport minus the 56px top bar (plus its safe-area padding) and <main>'s own vertical padding (which
 * below lg also clears the fixed bottom tab bar and the safe-area inset).
 * Keep in sync with app/(platform)/layout.tsx and components/layout/header.tsx.
 */
export const MESSAGES_VIEWPORT_HEIGHT =
  "h-[calc(100dvh-3.5rem-var(--safe-top)-2rem-var(--tab-bar-height)-var(--safe-bottom))] min-h-[28rem] lg:h-[calc(100dvh-3.5rem-var(--safe-top)-3rem)] 2xl:h-[calc(100dvh-3.5rem-var(--safe-top)-4rem)]";

/** The bordered surface that holds the inbox panes or a single thread. */
export const MESSAGES_PANE_SURFACE = "overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border";
