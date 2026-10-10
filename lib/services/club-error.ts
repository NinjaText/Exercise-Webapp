/**
 * Shared by club.service and the house-coach/ownership services (kept separate
 * so they don't import each other). Re-exported from club.service.
 */
export type ClubErrorCode =
  | "invalid_input"
  | "slug_taken"
  /** Stripe couldn't be read or written; nothing was saved. */
  | "stripe_unavailable"
  | "starter_invalid"
  | "has_clients"
  | "not_found"
  | "house_coach_failed"
  | "trainer_remove_failed";

export class ClubError extends Error {
  constructor(public code: ClubErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ClubError";
  }
}
