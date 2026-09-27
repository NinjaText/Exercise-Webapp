import "server-only";

import {
  adjustLightnessUntil,
  contrast,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  WHITE,
} from "@/lib/branding/color";
import { isPlainEmailAddress } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";
import { getOrgBranding } from "@/lib/services/branding.service";
import { getOrganizationOrNull } from "@/lib/services/organization.service";

/**
 * Org branding for emails whose recipient is a CLIENT (spec §7, §12.5).
 *
 * Brand follows the recipient's relationship: a client's relationship is with
 * their coach, so their mail carries the org's name, accent and logo, a From
 * display name of the org (at the existing verified address) and a Reply-To of
 * the org's contact email. Trainer-recipient and billing mail never calls this.
 */

/** The current `EmailLayout` defaults — an unbranded client email looks exactly like today. */
export const DEFAULT_EMAIL_ORG_NAME = "INMOTUS RX";
export const DEFAULT_EMAIL_ACCENT = "#2563eb";

export interface EmailBranding {
  /** false → the product look; templates then keep their own accent. */
  enabled: boolean;
  organizationName: string;
  /**
   * Hex (email clients have no oklch), always ≥ 4.5:1 against white button
   * text. `undefined` when branding is enabled but no brand color was set
   * (name/logo only) — templates then keep their own accent, exactly as an
   * unbranded org would.
   */
  accent?: string;
  /**
   * Own-bucket PNG for DARK surfaces (`logoOnDarkUrl`): the layout shows it on
   * the accent bar, which `emailSafeAccent` always darkens for white text, so a
   * light-surface logo would be illegible there. Absent → the name renders as
   * text; the light logo is never used as a fallback.
   */
  logoUrl?: string;
  /** `From` display name; `sendEmail` quotes and sanitizes it. */
  fromName: string;
  /** Org contact email, only when it is a single plain address. */
  replyTo?: string;
}

/** The subset of `EmailBranding` a template forwards to `EmailLayout`. */
export type EmailBrandProps = Pick<EmailBranding, "organizationName" | "accent" | "logoUrl">;

export const DEFAULT_EMAIL_BRANDING: EmailBranding = Object.freeze({
  enabled: false,
  organizationName: DEFAULT_EMAIL_ORG_NAME,
  accent: DEFAULT_EMAIL_ACCENT,
  fromName: DEFAULT_EMAIL_ORG_NAME,
});

/**
 * The layout puts white text on the accent (header name, CTA button). The
 * org's `primaryHex` is contrast-checked against *its* foreground, which may
 * be dark for a light brand colour — so for email, darken until white text
 * reaches WCAG AA (4.5:1). Unparseable input → the default accent.
 */
export function emailSafeAccent(hex: string): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return DEFAULT_EMAIL_ACCENT;
  const color = hexToOklch(normalized);
  if (contrast(color, WHITE) >= 4.5) return normalized;
  // Target 4.6 so rounding back to hex cannot land under 4.5. L=0 is black
  // (21:1), so 100 steps of 0.01 always get there.
  const { color: darker } = adjustLightnessUntil(color, WHITE, 4.6, "darker", 0.01, 100);
  return oklchToHex(darker);
}

/** A single plain address, safe for `Reply-To`. */
export function isValidReplyTo(value: unknown): value is string {
  return isPlainEmailAddress(value);
}

async function contactEmail(clerkOrgId: string): Promise<string | undefined> {
  try {
    const org = await getOrganizationOrNull(clerkOrgId);
    const email = org?.email?.trim();
    return isValidReplyTo(email) ? email : undefined;
  } catch (err) {
    console.error(`[email] org contact email lookup failed for ${clerkOrgId}:`, err);
    return undefined;
  }
}

/**
 * Email branding for an org. Never throws: any lookup failure logs and falls
 * back to the product defaults, so branding can never block an email.
 */
export async function getEmailBranding(clerkOrgId: string | null): Promise<EmailBranding> {
  if (!clerkOrgId) return DEFAULT_EMAIL_BRANDING;
  try {
    const b = await getOrgBranding(clerkOrgId);
    if (!b.enabled) return DEFAULT_EMAIL_BRANDING;

    const replyTo = await contactEmail(clerkOrgId);
    return {
      enabled: true,
      organizationName: b.displayName,
      // No accent (template keeps its own default) unless a color was
      // actually set — an org that only branded a name/logo shouldn't force
      // every template to the same blue as a "color".
      ...(b.tokens ? { accent: emailSafeAccent(b.primaryHex) } : {}),
      // Dark-surface logo only: the header bar is always a dark accent.
      ...(b.logoOnDarkUrl ? { logoUrl: b.logoOnDarkUrl } : {}),
      fromName: b.displayName,
      ...(replyTo ? { replyTo } : {}),
    };
  } catch (err) {
    console.error(`[email] branding lookup failed for ${clerkOrgId}; using defaults:`, err);
    return DEFAULT_EMAIL_BRANDING;
  }
}

/**
 * Branding for a notification recipient: resolved from the recipient's own
 * DB `clerkOrgId` (clients belong to their trainer's org). `null` when the
 * recipient is not a CLIENT — used by types that can go either way (messages,
 * voice memos) so a trainer recipient stays product-branded — or when the
 * lookup fails (then the email goes out exactly as it did before branding).
 */
export async function getClientEmailBranding(userId: string): Promise<EmailBranding | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clerkOrgId: true },
    });
    if (user?.role !== "CLIENT") return null;
    return await getEmailBranding(user.clerkOrgId);
  } catch (err) {
    console.error(`[email] recipient lookup for branding failed for user ${userId}:`, err);
    return null;
  }
}

/** Template props for a branded org; `undefined` keeps a template's own look. */
export function templateBrand(b: EmailBranding): EmailBrandProps | undefined {
  if (!b.enabled) return undefined;
  return {
    organizationName: b.organizationName,
    ...(b.accent ? { accent: b.accent } : {}),
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
  };
}
