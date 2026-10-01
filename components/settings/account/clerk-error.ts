import { isClerkAPIResponseError, isReverificationCancelledError } from "@clerk/nextjs/errors";

/** True when the user closed Clerk's "confirm it's you" prompt — not an error worth a toast. */
export function isCancelledReverification(error: unknown): boolean {
  return isReverificationCancelledError(error);
}

/** Clerk's own sentence for an API error ("Password is incorrect…"), or `fallback`. */
export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    return first?.longMessage || first?.message || fallback;
  }
  return fallback;
}
