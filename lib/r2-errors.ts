/**
 * Log-safe helpers for AWS SDK v3 (R2) errors. SDK errors carry `$response`
 * and request internals, so never log the error object itself.
 *
 * Pure (no SDK import, no secrets), so it needs no `server-only` guard; it is
 * only used from the upload route and branding Server Actions.
 */

export type R2ErrorSummary = {
  name: string;
  message: string | undefined;
  httpStatusCode: number | undefined;
};

function httpStatusOf(error: unknown): number | undefined {
  const status = (error as { $metadata?: { httpStatusCode?: unknown } } | null)?.$metadata
    ?.httpStatusCode;
  return typeof status === "number" ? status : undefined;
}

/** `{ name, message, httpStatusCode }` — the only shape we log for an R2 failure. */
export function r2ErrorSummary(error: unknown): R2ErrorSummary {
  if (!(error instanceof Error)) {
    return { name: typeof error, message: undefined, httpStatusCode: undefined };
  }
  return { name: error.name, message: error.message, httpStatusCode: httpStatusOf(error) };
}

/** True for "object does not exist": HTTP 404, `NotFound` (HEAD) or `NoSuchKey` (GET/Copy). */
export function isR2NotFound(error: unknown): boolean {
  if (httpStatusOf(error) === 404) return true;
  const name = error instanceof Error ? error.name : undefined;
  return name === "NotFound" || name === "NoSuchKey";
}
