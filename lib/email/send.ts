import type * as React from "react";
import { getResend } from "@/lib/email/resend";

const DEFAULT_FROM = "noreply@send.goinmotus.com";

/** The verified sending address. Resolved here so the fallback lives in one place. */
export function emailFrom(): string {
  return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
}

const MAX_DISPLAY_NAME_CHARS = 64;

// Invisible bidi / zero-width / format characters. They let a name render as
// something other than what it is (e.g. U+202E reverses the text after it),
// so they are dropped outright.
const INVISIBLE_FORMAT_CHARS_RE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/**
 * The bare address of a sender value. `RESEND_FROM_EMAIL` may be either
 * `addr` or `Name <addr>` (Resend accepts both); only the address may sit
 * behind a branded display name, or the header would nest two names.
 */
function bareSenderAddress(value: string): string {
  const match = /<([^<>\s]+)>\s*$/.exec(value);
  return match ? match[1] : value.trim();
}

/**
 * Builds a `From` value with an RFC 5322 quoted display name in front of the
 * verified sending address: `"Summit PT" <noreply@…>`. When `address` is
 * itself `Name <addr>`, only `addr` is used.
 *
 * The display name comes from trainer-editable org branding, so it is treated
 * as hostile: line breaks (CR, LF, tab, U+2028/9) become spaces and every
 * other control character is dropped — a name can never start a new header
 * line — as are bidi/zero-width format characters (U+200B–U+200F,
 * U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF). Angle brackets and
 * `@` are removed so the name cannot pose as an address. `\` and `"` are then
 * escaped for the quoted-string. Other non-ASCII (accents, emoji) is kept;
 * Resend encodes it. Capped at 64 code points. Returns `address` unchanged
 * when nothing printable is left.
 */
export function formatFromHeader(displayName: string, address: string): string {
  const cleaned = displayName
    .replace(INVISIBLE_FORMAT_CHARS_RE, "")
    .replace(/[\r\n\t\u2028\u2029]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f<>@]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const capped = Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_CHARS).join("").trim();
  if (!capped) return address;
  return `"${capped.replace(/["\\]/g, "\\$&")}" <${bareSenderAddress(address)}>`;
}

// One plain address, no display name, no list, no whitespace/header chars.
const PLAIN_EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

/** True for a single plain address safe to use as `Reply-To`. */
export function isPlainEmailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && PLAIN_EMAIL_RE.test(value);
}

/**
 * Development safety valve: when `EMAIL_REDIRECT_TO` is set, every email goes
 * to that address instead of its real recipient.
 *
 * Local development runs against a database of real clients, so without this a
 * test message would email an actual customer. It also sidesteps Resend's
 * sandbox rule that only your own account address is deliverable until a domain
 * is verified.
 *
 * Refuses to engage when NODE_ENV is "production", so setting the variable on a
 * deployment by accident cannot silently swallow all customer mail.
 */
function resolveRecipient(to: string | string[]): {
  to: string | string[];
  redirectedFrom?: string;
} {
  const redirectTo = process.env.EMAIL_REDIRECT_TO;
  if (!redirectTo || process.env.NODE_ENV === "production") return { to };

  const original = Array.isArray(to) ? to.join(", ") : to;
  return { to: redirectTo, redirectedFrom: original };
}

/**
 * Sends one email via Resend.
 *
 * Never throws. A missing API key, a Resend outage, or a template that fails
 * to render all resolve to `false` — email delivery must never break the
 * action that triggered it.
 */
export async function sendEmail(args: {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  /**
   * When given, the message carries RFC 8058 one-click unsubscribe headers.
   * Gmail and Yahoo have required these of bulk senders since 2024, and their
   * absence costs inbox placement even from a fully authenticated domain.
   *
   * Omit for transactional mail (billing), which has no unsubscribe link.
   */
  unsubscribeUrl?: string;
  /**
   * Display name for the `From` header (org branding on client mail). The
   * address stays the verified sender from `emailFrom()`. Omit to send from
   * the bare address.
   */
  fromName?: string;
  /** `Reply-To` (the org's contact email). Dropped unless a single plain address. */
  replyTo?: string;
}): Promise<boolean> {
  const { to, redirectedFrom } = resolveRecipient(args.to);
  if (redirectedFrom) {
    console.warn(
      `[email] EMAIL_REDIRECT_TO is set — "${args.subject}" redirected from ${redirectedFrom} to ${to}`
    );
  }

  // `List-Unsubscribe-Post` tells the mail client the URL honours a bare POST,
  // which is exactly what the unsubscribe route's POST handler does. Sending
  // the Post header without a URL would be meaningless, so they travel together.
  const headers = args.unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${args.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  const from = args.fromName ? formatFromHeader(args.fromName, emailFrom()) : emailFrom();
  const replyTo = isPlainEmailAddress(args.replyTo) ? args.replyTo : undefined;

  try {
    const result = await getResend().emails.send({
      from,
      to,
      subject: args.subject,
      react: args.react,
      ...(replyTo ? { replyTo } : {}),
      ...(headers ? { headers } : {}),
    });

    // Resend reports some failures in the response body rather than throwing:
    // an unverified domain, a rejected recipient, a rate limit. Those must not
    // read as success — `actions/program-actions.ts` shows the user an error
    // based on this boolean.
    if (result?.error) {
      console.error(`[email] Resend rejected "${args.subject}":`, result.error);
      return false;
    }
    return true;
  } catch (err) {
    const recipients = Array.isArray(args.to) ? args.to.join(", ") : args.to;
    console.error(`[email] failed to send "${args.subject}" to ${recipients}:`, err);
    return false;
  }
}
