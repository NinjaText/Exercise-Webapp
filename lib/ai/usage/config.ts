import type { PlanTier } from "@prisma/client";

/**
 * PLACEHOLDER monthly AI token allowances per trainer plan tier.
 *
 * The client has not decided the real numbers yet. These are only the
 * fallbacks used when no AiTierAllowance row exists for a tier — super admins
 * set the real values at /admin/ai-usage, which takes effect immediately.
 *
 * Rough scale (gpt-4o): one multi-week program generation is ~20–60k tokens;
 * a nutrition photo analysis ~2–4k.
 */
export const DEFAULT_TIER_ALLOWANCES: Record<PlanTier, number> = {
  STARTER: 500_000, // PLACEHOLDER
  PRO: 1_500_000, // PLACEHOLDER
  UNLIMITED: 5_000_000, // PLACEHOLDER
};

/** Account key for AI calls made with no signed-in user (cron, webhooks). Never blocked. */
export const SYSTEM_ACCOUNT_KEY = "system";

/** Upper bound for admin-entered token numbers (Prisma Int on Mongo is 32-bit). */
export const MAX_TOKEN_SETTING = 2_000_000_000;

/** Why an account is never blocked (it is still tracked). */
export type UnlimitedReason = "system" | "super_admin" | "billing_exempt" | "club" | "override" | "no_trainer";

export const UNLIMITED_REASON_LABELS: Record<UnlimitedReason, string> = {
  system: "System",
  super_admin: "Super admin",
  billing_exempt: "Billing exempt",
  club: "Club",
  override: "Admin override",
  no_trainer: "No trainer",
};
