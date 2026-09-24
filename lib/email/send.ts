import type * as React from "react";
import { getResend } from "@/lib/email/resend";

const DEFAULT_FROM = "noreply@send.goinmotus.com";

/** The verified sending address. Resolved here so the fallback lives in one place. */
export function emailFrom(): string {
  return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
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

  try {
    const result = await getResend().emails.send({
      from: emailFrom(),
      to,
      subject: args.subject,
      react: args.react,
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
