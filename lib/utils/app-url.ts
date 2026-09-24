const DEFAULT_APP_URL = "https://app.goinmotus.com";

/**
 * The public base URL for links in emails and notifications.
 * Resolved here so the fallback string lives in exactly one place.
 */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
}
