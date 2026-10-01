/**
 * Shared by club.service and club-trainer.service (kept separate so the two
 * don't import each other). Re-exported from club.service.
 */
export type ClubErrorCode =
  | "invalid_input"
  | "slug_taken"
  /** Stripe couldn't be read or written; nothing was saved. */
  | "stripe_unavailable"
  | "starter_invalid"
  | "has_clients"
  | "not_found"
  | "trainer_email_taken"
  | "trainer_invite_failed"
  | "trainer_remove_failed";

export class ClubError extends Error {
  constructor(public code: ClubErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ClubError";
  }
}
