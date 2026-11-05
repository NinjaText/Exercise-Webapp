/** Thrown before an AI call when the billed account has no allowance left. */
export class AiUsageLimitError extends Error {
  readonly code = "AI_USAGE_LIMIT" as const;
  readonly resetsAt: Date;

  /** `onBehalfOfCoach`: the caller is a client billed to their trainer's allowance. */
  constructor(resetsAt: Date, opts: { onBehalfOfCoach?: boolean } = {}) {
    super(opts.onBehalfOfCoach ? coachAllowanceUsedMessage(resetsAt) : aiUsageLimitMessage(resetsAt));
    this.name = "AiUsageLimitError";
    this.resetsAt = resetsAt;
  }
}

export function formatResetDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function aiUsageLimitMessage(resetsAt: Date): string {
  return `You've used this month's AI allowance. Upgrade your plan or wait until ${formatResetDate(resetsAt)}.`;
}

export function coachAllowanceUsedMessage(resetsAt: Date): string {
  return `AI features are paused: your coach's monthly AI allowance is used up. It resets on ${formatResetDate(resetsAt)}.`;
}

/** Works across module copies (name/code check), not only `instanceof`. */
export function isAiUsageLimitError(error: unknown): error is AiUsageLimitError {
  return (
    error instanceof AiUsageLimitError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "AI_USAGE_LIMIT" &&
      typeof (error as { message?: unknown }).message === "string")
  );
}

/** For action catch blocks: the limit message if that's what failed, else `fallback`. */
export function aiErrorMessage(error: unknown, fallback: string): string {
  return isAiUsageLimitError(error) ? error.message : fallback;
}
