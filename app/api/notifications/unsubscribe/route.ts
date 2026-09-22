import { NextResponse } from "next/server";
import {
  resolveUnsubToken,
  updatePreference,
} from "@/lib/services/notification-preference.service";
import { CATEGORY_LABELS, type NotificationCategory } from "@/lib/notifications/types";
import { appBaseUrl } from "@/lib/utils/app-url";

/** Billing is transactional and carries no unsubscribe link, so it is not listed. */
/** Billing is excluded at the type level, not just at runtime. */
type UnsubscribableCategory = Exclude<NotificationCategory, "billing">;

const UNSUBSCRIBABLE: UnsubscribableCategory[] = ["sessions", "messages", "nutrition"];

function isUnsubscribable(value: string | null): value is UnsubscribableCategory {
  return value !== null && (UNSUBSCRIBABLE as string[]).includes(value);
}

/**
 * Escapes a value for interpolation into an HTML attribute.
 *
 * `token` currently can only be a 64-char hex string (resolveUnsubToken does an
 * exact-match lookup, and unsubToken is only ever written by
 * randomBytes(32).toString("hex")), so this is a no-op in practice. It is here so
 * the safety of this page does not depend on an invariant maintained in another
 * file — a future token scheme must not be able to reintroduce attribute breakout.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function page(inner: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Email preferences</title>
<style>
  body { background:#f4f6f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; margin:0; padding:48px 16px; }
  .card { background:#fff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.08); margin:0 auto; max-width:480px; padding:32px; }
  h1 { color:#111827; font-size:20px; margin:0 0 12px; }
  p { color:#4b5563; font-size:15px; line-height:1.6; margin:0 0 16px; }
  button { background:#2563eb; border:0; border-radius:8px; color:#fff; cursor:pointer; font-size:15px; font-weight:600; padding:12px 28px; }
  a { color:#2563eb; font-size:14px; }
</style>
</head><body><div class="card">${inner}</div></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Built fresh per call on purpose: a NextResponse body is a single-use stream,
 * so a shared module-level instance would fail on the second request. Calling
 * `appBaseUrl()` here rather than at import time also keeps it configurable.
 */
function invalidPage(): NextResponse {
  return page(
    `<h1>This link is invalid or expired</h1>
     <p>We could not apply this change. You can manage every email preference from your account settings.</p>
     <p><a href="${appBaseUrl()}/settings/notifications">Manage email preferences</a></p>`
  );
}

function scopeLabel(category: UnsubscribableCategory | null): string {
  return category ? `${CATEGORY_LABELS[category]} emails` : "all non-essential emails";
}

/**
 * Renders a confirmation form. Deliberately has no side effects: mail clients
 * and security gateways prefetch links, and a mutating GET would let a scanner
 * unsubscribe someone who never clicked.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const rawCategory = url.searchParams.get("category");

  if (rawCategory !== null && !isUnsubscribable(rawCategory)) return invalidPage();
  if (!(await resolveUnsubToken(token))) return invalidPage();

  const category = rawCategory as UnsubscribableCategory | null;
  const safeToken = escapeAttr(encodeURIComponent(token));
  const action = `${appBaseUrl()}/api/notifications/unsubscribe?token=${safeToken}${
    category ? `&category=${escapeAttr(category)}` : ""
  }`;

  return page(
    `<h1>Unsubscribe from ${scopeLabel(category)}?</h1>
     <p>You will still see these notifications in the app — this only stops the email.</p>
     <form method="POST" action="${action}"><button type="submit">Unsubscribe</button></form>
     <p><a href="${appBaseUrl()}/settings/notifications">Manage all preferences instead</a></p>`
  );
}

/** Applies the change. */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const rawCategory = url.searchParams.get("category");

  if (rawCategory !== null && !isUnsubscribable(rawCategory)) return invalidPage();

  const owner = await resolveUnsubToken(token);
  if (!owner) return invalidPage();

  const category = rawCategory as UnsubscribableCategory | null;
  await updatePreference(owner.userId, category ? { [category]: false } : { emailEnabled: false });

  return page(
    `<h1>You've been unsubscribed from ${scopeLabel(category)}</h1>
     <p>You'll still see these in the app. Nothing else about your account has changed.</p>
     <p><a href="${appBaseUrl()}/settings/notifications">Manage email preferences</a></p>`
  );
}
