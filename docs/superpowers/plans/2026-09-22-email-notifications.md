# Email Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair every in-app notification with an optional Resend email, governed by per-category user preferences, per-type cooldowns, and one-click unsubscribe.

**Architecture:** Four layers, each testable without the one above it. `sendEmail()` is a non-throwing transport; `<EmailLayout>` is the single shared template chrome; `NOTIFICATION_REGISTRY` maps each notification type to a template, category, cooldown, and transactional flag; `notifyUser()` creates the in-app notification unconditionally, then consults registry + preferences + cooldown before sending. Call sites state what happened and nothing else.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6 on MongoDB (`db push`, no migration files), Resend 6.9.3, Vitest 4 (node environment), Tailwind 4 with semantic design tokens, Clerk 7 auth.

**Spec:** `docs/superpowers/specs/2026-09-21-email-notifications-design.md`

## Global Constraints

- **Never run `git add` or `git commit`.** The user reviews and commits all work themselves. Every task ends with a verification step, not a commit.
- **Prisma is on MongoDB.** Schema changes apply with `npx prisma db push`, never `prisma migrate`. All ids are `String @id @default(auto()) @map("_id") @db.ObjectId`.
- **Vitest runs in the `node` environment** (`vitest.config.ts`), so there is no DOM. Do not write React rendering tests. Test modules, not components.
- **Test command:** `npm test -- <path>` for one file, `npm test` for all.
- **`@/` aliases the repo root** (`vitest.config.ts` and `tsconfig.json` agree).
- **No raw Tailwind palette classes.** The `no-raw-palette` ESLint rule is a hard error. Use semantic tokens only (`bg-muted`, `text-muted-foreground`, `border-border`, `text-foreground`). Verify with `npm run lint`.
- **`notifyUser()` must never throw.** No caller may fail because of email. This is the central invariant of the whole system.
- **The in-app notification is never gated.** It is created before any preference, cooldown, or template check.
- **Email copy uses "trainer" and "client"**, never "clinician" or "patient". Several Prisma fields are `@map`ped to the older names (`clinicianId`, `patientId`) — use the Prisma field name in code, the newer word in copy.
- **Default sender** is `process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com"`, resolved in exactly one place (`lib/email/send.ts`).
- **Default app URL** is `process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app"`, resolved in exactly one place (`lib/utils/app-url.ts`).

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `lib/utils/app-url.ts` | Resolve the public base URL. One function. |
| `lib/email/send.ts` | Non-throwing Resend transport. The only caller of `getResend()` outside `resend.ts`. |
| `lib/email/templates/layout.tsx` | `<EmailLayout>` + `DetailRow` + the single `styles` object. All template chrome. |
| `lib/notifications/types.ts` | `NOTIFICATION_TYPES`, `NotificationType`, `NotificationCategory`. Exists to break the registry ↔ service import cycle. |
| `lib/notifications/registry.ts` | Type → `{ category, transactional, template, subject, cooldownMinutes }`. |
| `lib/services/notification-preference.service.ts` | Preference reads/writes, defaults, unsub tokens, allowance logic. |
| `app/api/notifications/unsubscribe/route.ts` | Token-authenticated one-click unsubscribe. |
| `app/(platform)/settings/notifications/page.tsx` | Server page. Both roles. |
| `components/settings/notification-preferences-form.tsx` | Client form, four toggles + master switch. |
| `actions/notification-preference-actions.ts` | `getMyPreferenceAction`, `updateMyPreferenceAction`. |
| `lib/email/templates/new-message.tsx` … ×10 | One per new email. Thin prop mapping over `EmailLayout`. |

**Modified files**

| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add `NotificationPreference`; add relation field to `User`. |
| `lib/services/notification.service.ts` | Add `notifyUser`; re-export types from `lib/notifications/types`; delete dead `createComplianceAlert`. |
| `lib/email/templates/*.tsx` (6 existing) | Rewrite over `EmailLayout`; delete private `styles` objects. |
| `lib/email/send-program-welcome.ts` | Use `sendEmail`. |
| `app/api/reminders/route.ts` | Use `notifyUser`. |
| `actions/session-v2-actions.ts` | Both helpers → `notifyUser`. Fixes unguarded throw. |
| `actions/compliance-actions.ts` | Raw `prisma.notification.create` + inline send → `notifyUser`. |
| `actions/program-actions.ts` | Share send → `sendEmail`. |
| `actions/message-actions.ts` | 3 sites gain `notifyUser`. |
| `actions/checkin-actions.ts` | 2 sites gain `notifyUser`. |
| `actions/voice-memo-actions.ts` | 1 site gains `notifyUser`. |
| `actions/feedback-actions.ts` | 1 site gains `notifyUser`. |
| `actions/nutrition-actions.ts` | 2 sites → `notifyUser`. |
| `app/api/cron/nutrition-nudges/route.ts` | → `notifyUser`. |
| `app/api/stripe/webhook/route.ts` | 3 branches gain `notifyUser` inside `after()`. |
| `components/layout/sidebar.tsx` | Notifications sub-nav item, visible to both roles. |
| `vercel.json` | Add `/api/reminders` cron. |
| `actions/__tests__/{session-v2,nutrition,voice-memo}-actions.test.ts` | Update mocks. |

---
## Task 1: Transport layer — `sendEmail` and `appBaseUrl`

**Files:**
- Create: `lib/utils/app-url.ts`
- Create: `lib/email/send.ts`
- Test: `lib/email/__tests__/send.test.ts`

**Interfaces:**
- Consumes: `getResend()` from `lib/email/resend.ts` (existing, unchanged).
- Produces:
  - `appBaseUrl(): string`
  - `emailFrom(): string`
  - `sendEmail(args: { to: string | string[]; subject: string; react: React.ReactElement }): Promise<boolean>`

`to` accepts an array because `actions/program-actions.ts` shares a program to a `to` + `cc` recipient list built by `parseShareRecipients`.

- [ ] **Step 1: Write the failing test**

Create `lib/email/__tests__/send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'

const sendMock = vi.fn()
vi.mock('@/lib/email/resend', () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}))

import { sendEmail, emailFrom } from '../send'

const el = React.createElement('div', null, 'hi')

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.RESEND_FROM_EMAIL
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('emailFrom', () => {
  it('falls back to the default sender', () => {
    expect(emailFrom()).toBe('noreply@inmotusrx.com')
  })

  it('prefers RESEND_FROM_EMAIL', () => {
    process.env.RESEND_FROM_EMAIL = 'hello@example.com'
    expect(emailFrom()).toBe('hello@example.com')
  })
})

describe('sendEmail', () => {
  it('sends with the resolved from address and returns true', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' } })

    const ok = await sendEmail({ to: 'a@example.com', subject: 'Subj', react: el })

    expect(ok).toBe(true)
    expect(sendMock).toHaveBeenCalledWith({
      from: 'noreply@inmotusrx.com',
      to: 'a@example.com',
      subject: 'Subj',
      react: el,
    })
  })

  it('passes an array of recipients through unchanged', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_2' } })

    await sendEmail({ to: ['a@example.com', 'b@example.com'], subject: 'S', react: el })

    expect(sendMock.mock.calls[0][0].to).toEqual(['a@example.com', 'b@example.com'])
  })

  it('returns false and does not throw when the send rejects', async () => {
    sendMock.mockRejectedValue(new Error('resend down'))

    await expect(sendEmail({ to: 'a@example.com', subject: 'S', react: el })).resolves.toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('returns false and does not throw when the client cannot be built', async () => {
    sendMock.mockImplementation(() => {
      throw new Error('RESEND_API_KEY environment variable is not set')
    })

    await expect(sendEmail({ to: 'a@example.com', subject: 'S', react: el })).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/email/__tests__/send.test.ts`
Expected: FAIL — `Cannot find module '../send'`.

- [ ] **Step 3: Write `lib/utils/app-url.ts`**

```ts
const DEFAULT_APP_URL = "https://inmotusrx.vercel.app";

/**
 * The public base URL for links in emails and notifications.
 * Resolved here so the fallback string lives in exactly one place.
 */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
}
```

- [ ] **Step 4: Write `lib/email/send.ts`**

```ts
import type * as React from "react";
import { getResend } from "@/lib/email/resend";

const DEFAULT_FROM = "noreply@inmotusrx.com";

/** The verified sending address. Resolved here so the fallback lives in one place. */
export function emailFrom(): string {
  return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
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
}): Promise<boolean> {
  try {
    await getResend().emails.send({
      from: emailFrom(),
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
    return true;
  } catch (err) {
    const recipients = Array.isArray(args.to) ? args.to.join(", ") : args.to;
    console.error(`[email] failed to send "${args.subject}" to ${recipients}:`, err);
    return false;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- lib/email/__tests__/send.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify nothing else broke**

Run: `npx tsc --noEmit` — expect no new errors.

---

## Task 2: Shared email layout, and rewrite the six existing templates

Each of the six templates in `lib/email/templates/` carries its own copy of the outer-table/card/header/footer markup and its own ~100-line `styles` object. This task extracts one layout and reduces each template to prop mapping. It also introduces the footer unsubscribe slot that every later task depends on.

**Files:**
- Create: `lib/email/templates/layout.tsx`
- Modify: `lib/email/templates/session-reminder.tsx` (full rewrite)
- Modify: `lib/email/templates/session-completed.tsx` (full rewrite)
- Modify: `lib/email/templates/missed-session.tsx` (full rewrite)
- Modify: `lib/email/templates/program-welcome.tsx` (full rewrite)
- Modify: `lib/email/templates/share-program.tsx` (full rewrite)
- Modify: `lib/email/templates/voice-memo-added.tsx` (full rewrite)
- Test: `lib/email/templates/__tests__/layout.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `EmailLayout(props: EmailLayoutProps): React.ReactElement`
  - `EmailLayoutProps` — exported, used by all 16 templates.
  - `CATEGORY_LABELS: Record<NotificationCategory, string>` is **not** here; the footer takes a plain `categoryLabel` string so this module stays free of notification imports.

Existing template prop signatures are **preserved exactly** so Task 6 can migrate call sites without touching prop names. `VoiceMemoAddedEmail` keeps its `role` prop but **loses its internal subject computation** — that moves to the registry in Task 4.

- [ ] **Step 1: Write the failing test**

Vitest runs in the `node` environment, so there is no DOM and no render. Test the layout's prop contract by walking the returned React element tree.

Create `lib/email/templates/__tests__/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EmailLayout } from '../layout'

/** Collects every string in a React element tree, for assertion without a DOM. */
function textOf(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  const el = node as { props?: { children?: unknown; href?: string } }
  if (!el.props) return ''
  return [el.props.href ?? '', textOf(el.props.children)].join(' ')
}

describe('EmailLayout', () => {
  it('renders the greeting, intro, brand, and detail rows', () => {
    const text = textOf(
      EmailLayout({
        title: 'Session Reminder',
        greeting: 'Hi Sarah,',
        intro: 'Your session is tomorrow.',
        details: [
          { label: 'Workout', value: 'Lower Body A' },
          { label: 'Date', value: 'Monday, March 3' },
        ],
      })
    )

    expect(text).toContain('INMOTUS RX')
    expect(text).toContain('Hi Sarah,')
    expect(text).toContain('Your session is tomorrow.')
    expect(text).toContain('Workout')
    expect(text).toContain('Lower Body A')
    expect(text).toContain('Monday, March 3')
  })

  it('renders the CTA label and href when given one', () => {
    const text = textOf(
      EmailLayout({
        title: 'T',
        greeting: 'Hi,',
        intro: 'i',
        cta: { label: 'View Your Session', href: 'https://app.test/sessions' },
      })
    )

    expect(text).toContain('View Your Session')
    expect(text).toContain('https://app.test/sessions')
  })

  it('renders an unsubscribe link naming the category', () => {
    const text = textOf(
      EmailLayout({
        title: 'T',
        greeting: 'Hi,',
        intro: 'i',
        unsubscribe: { url: 'https://app.test/api/notifications/unsubscribe?token=abc', categoryLabel: 'message' },
      })
    )

    expect(text).toContain('Unsubscribe from message emails')
    expect(text).toContain('token=abc')
  })

  it('omits the unsubscribe link entirely for transactional mail', () => {
    const text = textOf(EmailLayout({ title: 'T', greeting: 'Hi,', intro: 'i' }))

    expect(text).not.toContain('Unsubscribe')
  })

  it('honours a custom organization name', () => {
    const text = textOf(
      EmailLayout({ title: 'T', greeting: 'Hi,', intro: 'i', organizationName: 'ACME PHYSIO' })
    )

    expect(text).toContain('ACME PHYSIO')
    expect(text).not.toContain('INMOTUS RX')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/email/templates/__tests__/layout.test.ts`
Expected: FAIL — `Cannot find module '../layout'`.

- [ ] **Step 3: Write `lib/email/templates/layout.tsx`**

The `styles` object is lifted verbatim from the current `session-reminder.tsx`, plus three additions for the unsubscribe link (`footerLink`), the free-form body slot, and the quoted-preview block used by message templates.

```tsx
import * as React from "react";

export interface EmailLayoutProps {
  /** Document <title>. Not the subject line — that comes from the registry. */
  title: string;
  organizationName?: string;
  /** e.g. "Hi Sarah," */
  greeting: string;
  intro: string;
  details?: Array<{ label: string; value: string }>;
  /** Optional blockquote-style excerpt, for message and note emails. */
  quote?: string;
  cta?: { label: string; href: string };
  footnote?: string;
  /** Omit for transactional mail — the footer link is then not rendered. */
  unsubscribe?: { url: string; categoryLabel: string };
  /** Reason line in the footer, e.g. "message notifications are on". */
  reason?: string;
  children?: React.ReactNode;
}

/**
 * The single layout every notification email renders through: header bar,
 * white card, optional detail rows, one CTA, footer.
 *
 * Email clients ignore most modern CSS, so this is nested tables with inline
 * styles on purpose. Do not replace it with flexbox or a stylesheet.
 */
export function EmailLayout({
  title,
  organizationName = "INMOTUS RX",
  greeting,
  intro,
  details,
  quote,
  cta,
  footnote,
  unsubscribe,
  reason,
  children,
}: EmailLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "40px 16px" }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>{organizationName}</p>
                      </td>
                    </tr>

                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>{greeting}</p>
                        <p style={styles.intro}>{intro}</p>

                        {details && details.length > 0 && (
                          <table width="100%" cellPadding={0} cellSpacing={0} style={styles.detailsCard}>
                            <tbody>
                              <tr>
                                <td style={styles.detailsPad}>
                                  {details.map((d) => (
                                    <DetailRow key={d.label} label={d.label} value={d.value} />
                                  ))}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {quote && <p style={styles.quote}>{quote}</p>}

                        {children}

                        {cta && (
                          <table
                            width="100%"
                            cellPadding={0}
                            cellSpacing={0}
                            style={{ marginTop: "28px", textAlign: "center" }}
                          >
                            <tbody>
                              <tr>
                                <td align="center">
                                  <a href={cta.href} style={styles.ctaButton}>
                                    {cta.label}
                                  </a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {footnote && <p style={styles.footnote}>{footnote}</p>}
                      </td>
                    </tr>

                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          &copy; {new Date().getFullYear()} {organizationName}. All rights reserved.
                        </p>
                        {reason && <p style={styles.footerText}>{reason}</p>}
                        {unsubscribe && (
                          <p style={styles.footerText}>
                            <a href={unsubscribe.url} style={styles.footerLink}>
                              Unsubscribe from {unsubscribe.categoryLabel} emails
                            </a>
                          </p>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "12px" }}>
      <tbody>
        <tr>
          <td style={styles.detailLabel}>{label}</td>
          <td style={styles.detailValue}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "#f4f6f9",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: 0,
  },
  outerTable: { backgroundColor: "#f4f6f9", maxWidth: "600px", margin: "0 auto" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    maxWidth: "560px",
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  headerBar: { backgroundColor: "#2563eb", padding: "24px 32px" },
  brandName: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "0.5px",
  },
  bodyPad: { padding: "32px" },
  greeting: { color: "#111827", fontSize: "20px", fontWeight: 600, margin: "0 0 12px 0" },
  intro: { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", margin: "0 0 24px 0" },
  detailsCard: { backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e5e7eb" },
  detailsPad: { padding: "20px 24px" },
  detailLabel: {
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: 500,
    width: "80px",
    paddingBottom: "4px",
    verticalAlign: "top",
  },
  detailValue: {
    color: "#111827",
    fontSize: "14px",
    fontWeight: 600,
    paddingBottom: "4px",
    verticalAlign: "top",
  },
  quote: {
    borderLeft: "3px solid #e5e7eb",
    color: "#374151",
    fontSize: "15px",
    fontStyle: "italic",
    lineHeight: "1.6",
    margin: "24px 0 0 0",
    padding: "4px 0 4px 16px",
  },
  ctaButton: {
    backgroundColor: "#2563eb",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 28px",
    textDecoration: "none",
    letterSpacing: "0.2px",
  },
  footnote: { color: "#9ca3af", fontSize: "13px", lineHeight: "1.5", marginTop: "28px", marginBottom: 0 },
  footer: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb", padding: "20px 32px" },
  footerText: { color: "#9ca3af", fontSize: "12px", lineHeight: "1.5", margin: "0 0 4px 0" },
  footerLink: { color: "#6b7280", fontSize: "12px", textDecoration: "underline" },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/email/templates/__tests__/layout.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Rewrite `session-reminder.tsx` over the layout**

Props unchanged. Replace the whole file:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface SessionReminderEmailProps {
  clientName: string;
  sessionDate: string;
  sessionTime: string;
  workoutName: string;
  sessionLink: string;
  organizationName?: string;
  unsubscribeUrl?: string;
}

export function SessionReminderEmail({
  clientName,
  sessionDate,
  sessionTime,
  workoutName,
  sessionLink,
  organizationName,
  unsubscribeUrl,
}: SessionReminderEmailProps) {
  return (
    <EmailLayout
      title="Session Reminder"
      organizationName={organizationName}
      greeting={`Hi ${clientName},`}
      intro="This is a friendly reminder that you have a workout session scheduled for tomorrow."
      details={[
        { label: "Workout", value: workoutName },
        { label: "Date", value: sessionDate },
        { label: "Time", value: sessionTime },
      ]}
      cta={{ label: "View Your Session", href: sessionLink }}
      footnote="If you have any questions or need to reschedule, please reach out to your care team through the platform."
      reason="You received this email because session notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "session" } : undefined}
    />
  );
}
```

- [ ] **Step 6: Rewrite the other five templates over the layout**

Same shape as Step 5 for each: keep the existing prop interface **verbatim**, add an optional `unsubscribeUrl?: string`, return one `<EmailLayout>`, and delete the private `styles` object and any local `DetailRow`. Read each file first to carry its body copy across word for word — none of the user-facing wording changes in this task.

The existing prop contracts, which must not change (Tasks 6, 9, and 12 pass exactly these keys):

| File | Props | `details` rows | `categoryLabel` |
|---|---|---|---|
| `session-completed.tsx` | `trainerName`, `clientName`, `workoutName`, `programName`, `clientLink`, `organizationName?` | Client, Workout, Program | `"session"` |
| `missed-session.tsx` | `trainerName`, `clientName`, `missedCount`, `lookbackDays`, `clientLink`, `organizationName?` | Client, Missed sessions, Period | `"session"` |
| `voice-memo-added.tsx` | `recipientName`, `senderName`, `workoutName`, `sessionLink`, `role` | From, Workout | `"message"` |
| `program-welcome.tsx` | `firstName?`, `programName`, `loginUrl`, `isNewAccount` | Program | **none** |
| `share-program.tsx` | `programName`, `clientName` (nullable), `senderName`, `pdfLink`, `organizationName?` | Program, Prepared by | **none** |

**Note the two naming exceptions.** `session-completed` and `missed-session` call their recipient `trainerName`, not `recipientName`. Keep it that way — Task 6 passes `trainerName` explicitly in its `email` payload rather than relying on the `recipientName` that `notifyUser` merges in. `voice-memo-added` already uses `recipientName` and so needs nothing passed.

`program-welcome` and `share-program` take **no `unsubscribe` prop at all**: both are transactional and sit outside the dispatcher, so neither ever receives an `unsubscribeUrl`.

`voice-memo-added.tsx` additionally **deletes its internal `subject` and `ctaLabel` computation**. Keep the `role` prop and use it only for the CTA label:

```tsx
cta={{ label: role === "client" ? "Listen to Voice Note" : "View Client Response", href: sessionLink }}
```

The subject branch it used to compute moves to the registry in Task 3.

- [ ] **Step 7: Verify the rewrites compile and nothing regressed**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all existing tests still pass. `actions/__tests__/voice-memo-actions.test.ts` mocks `getResend`, so it is unaffected by template internals.

Run: `grep -rn "styles" lib/email/templates/*.tsx | grep -v layout.tsx`
Expected: no output — every private `styles` object is gone.

---
## Task 3: Notification types and the delivery registry

`lib/services/notification.service.ts` currently owns `NOTIFICATION_TYPES`, and the registry needs those constants while the service needs the registry. Moving the constants to their own module breaks that cycle. The service re-exports them so the ~8 files that already `import { NOTIFICATION_TYPES } from "@/lib/services/notification.service"` keep working untouched.

**Files:**
- Create: `lib/notifications/types.ts`
- Create: `lib/notifications/registry.ts`
- Modify: `lib/services/notification.service.ts:4-20` (replace the inline const with a re-export)
- Test: `lib/notifications/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: the four rewritten templates from Task 2 — `SessionReminderEmail`, `SessionCompletedEmail`, `MissedSessionEmail`, `VoiceMemoAddedEmail`.
- Produces:
  - `NOTIFICATION_TYPES` (17 keys), `NotificationType`, `NotificationCategory`
  - `CATEGORY_LABELS: Record<NotificationCategory, string>`
  - `EmailTemplate`, `tpl()`
  - `RegistryEntry`, `NOTIFICATION_REGISTRY: Record<NotificationType, RegistryEntry>`

Thirteen of the seventeen entries land with `template: null` in this task. Tasks 9–11 fill them in. `template: null` is a valid, permanent state — it means "in-app only" — so the completeness test passes at every point in the build.

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TYPES, CATEGORY_LABELS, type NotificationType } from '../types'
import { NOTIFICATION_REGISTRY } from '../registry'

const allTypes = Object.values(NOTIFICATION_TYPES) as NotificationType[]

describe('NOTIFICATION_REGISTRY', () => {
  it('has an entry for every notification type', () => {
    const missing = allTypes.filter((t) => !NOTIFICATION_REGISTRY[t])
    expect(missing).toEqual([])
  })

  it('has no entry for a type that does not exist', () => {
    const extra = Object.keys(NOTIFICATION_REGISTRY).filter(
      (k) => !allTypes.includes(k as NotificationType)
    )
    expect(extra).toEqual([])
  })

  it('gives every emailing type a subject function', () => {
    for (const type of allTypes) {
      const entry = NOTIFICATION_REGISTRY[type]
      if (entry.template) {
        expect(typeof entry.subject, `${type} has a template but no subject`).toBe('function')
      }
    }
  })

  it('marks every billing type transactional and nothing else', () => {
    for (const type of allTypes) {
      const entry = NOTIFICATION_REGISTRY[type]
      expect(entry.transactional, `${type}`).toBe(entry.category === 'billing')
    }
  })

  it('uses a known category with a human label for every type', () => {
    for (const type of allTypes) {
      expect(CATEGORY_LABELS[NOTIFICATION_REGISTRY[type].category], `${type}`).toBeTruthy()
    }
  })

  it('uses a positive cooldown or null, never zero or negative', () => {
    for (const type of allTypes) {
      const cd = NOTIFICATION_REGISTRY[type].cooldownMinutes
      if (cd !== null) expect(cd, `${type}`).toBeGreaterThan(0)
    }
  })

  it('caps the daily nutrition nudges at one per day', () => {
    for (const type of [
      NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS,
      NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN,
      NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER,
    ]) {
      expect(NOTIFICATION_REGISTRY[type].cooldownMinutes).toBe(1440)
    }
  })

  it('produces the role-specific voice memo subject the old template computed inline', () => {
    const subject = NOTIFICATION_REGISTRY[NOTIFICATION_TYPES.VOICE_MEMO].subject
    expect(subject({ senderName: 'Mike Chen', role: 'client' })).toBe('Mike Chen left you a voice note')
    expect(subject({ senderName: 'Mike Chen', role: 'trainer' })).toBe('Mike Chen left a voice note')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/notifications/__tests__/registry.test.ts`
Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 3: Write `lib/notifications/types.ts`**

The twelve existing constants are copied verbatim from `lib/services/notification.service.ts:4-20`; five are new.

```ts
/**
 * Notification type constants and categories.
 *
 * These live outside `notification.service.ts` so the registry can import them
 * without the service and the registry importing each other.
 */
export const NOTIFICATION_TYPES = {
  SESSION_REMINDER: "SESSION_REMINDER",
  CHECK_IN_DUE: "CHECK_IN_DUE",
  SESSION_COMPLETED: "SESSION_COMPLETED",
  MISSED_SESSION: "MISSED_SESSION",
  NEW_RESPONSE: "NEW_RESPONSE",
  NEW_MESSAGE: "NEW_MESSAGE",
  EXERCISE_NOTE: "EXERCISE_NOTE",
  NUTRITION_COMMENT: "NUTRITION_COMMENT",
  NUTRITION_REPLY: "NUTRITION_REPLY",
  NUTRITION_NUDGE_MEALS: "NUTRITION_NUDGE_MEALS",
  NUTRITION_NUDGE_PROTEIN: "NUTRITION_NUDGE_PROTEIN",
  NUTRITION_NUDGE_WATER: "NUTRITION_NUDGE_WATER",
  // Added by the email notification system.
  VOICE_MEMO: "VOICE_MEMO",
  FEEDBACK_RESPONSE: "FEEDBACK_RESPONSE",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  SUBSCRIPTION_CANCELED: "SUBSCRIPTION_CANCELED",
  REFUND_PROCESSED: "REFUND_PROCESSED",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * The four user-facing preference groups. These names are also the boolean
 * field names on `NotificationPreference`, which is what lets the dispatcher
 * check allowance with `prefs[entry.category]`.
 */
export type NotificationCategory = "sessions" | "messages" | "nutrition" | "billing";

/** Used in the email footer: "Unsubscribe from <label> emails". */
export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  sessions: "session",
  messages: "message",
  nutrition: "nutrition",
  billing: "billing",
};
```

- [ ] **Step 4: Write `lib/notifications/registry.ts`**

```tsx
import type * as React from "react";
import {
  NOTIFICATION_TYPES,
  type NotificationCategory,
  type NotificationType,
} from "./types";
import { SessionReminderEmail } from "@/lib/email/templates/session-reminder";
import { SessionCompletedEmail } from "@/lib/email/templates/session-completed";
import { MissedSessionEmail } from "@/lib/email/templates/missed-session";
import { VoiceMemoAddedEmail } from "@/lib/email/templates/voice-memo-added";

/**
 * Templates each declare their own prop interface, but the dispatcher assembles
 * props dynamically from `notifyUser`'s `email` payload, so the registry erases
 * the prop type. `tpl()` is the one place that erasure happens.
 *
 * The trade-off: a missing prop is a runtime `undefined` in an email body, not
 * a compile error. The per-type call-site tests in Tasks 9–11 assert the
 * payload keys for exactly this reason.
 */
export type EmailTemplate = (props: Record<string, unknown>) => React.ReactElement;

export function tpl<P>(component: (props: P) => React.ReactElement): EmailTemplate {
  return component as unknown as EmailTemplate;
}

export interface RegistryEntry {
  category: NotificationCategory;
  /** Transactional mail ignores preferences and carries no unsubscribe link. */
  transactional: boolean;
  /** `null` means in-app only — a deliberate, permanent state. */
  template: EmailTemplate | null;
  subject: (data: Record<string, unknown>) => string;
  /** Minutes. `null` means no cap. */
  cooldownMinutes: number | null;
}

const NO_SUBJECT = () => "";

export const NOTIFICATION_REGISTRY: Record<NotificationType, RegistryEntry> = {
  // ── Sessions ──────────────────────────────────────────────────────────────
  [NOTIFICATION_TYPES.SESSION_REMINDER]: {
    category: "sessions",
    transactional: false,
    template: tpl(SessionReminderEmail),
    // `app/api/reminders/route.ts` already dedupes per session via
    // metadata.sessionId, so no cooldown is needed here.
    cooldownMinutes: null,
    subject: (d) => `Reminder: Your session "${d.workoutName}" is tomorrow`,
  },
  [NOTIFICATION_TYPES.SESSION_COMPLETED]: {
    category: "sessions",
    transactional: false,
    template: tpl(SessionCompletedEmail),
    cooldownMinutes: null,
    subject: (d) => `${d.clientName} completed a session`,
  },
  [NOTIFICATION_TYPES.MISSED_SESSION]: {
    category: "sessions",
    transactional: false,
    template: tpl(MissedSessionEmail),
    cooldownMinutes: 1440,
    subject: (d) => `Missed sessions: ${d.clientName}`,
  },
  [NOTIFICATION_TYPES.EXERCISE_NOTE]: {
    category: "sessions",
    transactional: false,
    template: null, // Task 9
    cooldownMinutes: 60,
    subject: (d) => `${d.clientName} left a note on an exercise`,
  },

  // ── Messages & check-ins ──────────────────────────────────────────────────
  [NOTIFICATION_TYPES.NEW_MESSAGE]: {
    category: "messages",
    transactional: false,
    template: null, // Task 9
    cooldownMinutes: 60,
    subject: (d) => `New message from ${d.senderName}`,
  },
  [NOTIFICATION_TYPES.CHECK_IN_DUE]: {
    category: "messages",
    transactional: false,
    template: null, // Task 9
    cooldownMinutes: null,
    subject: (d) => `New check-in: ${d.templateName}`,
  },
  [NOTIFICATION_TYPES.NEW_RESPONSE]: {
    category: "messages",
    transactional: false,
    template: null, // Task 9
    cooldownMinutes: 60,
    subject: (d) => `${d.clientName} submitted a check-in`,
  },
  [NOTIFICATION_TYPES.VOICE_MEMO]: {
    category: "messages",
    transactional: false,
    template: tpl(VoiceMemoAddedEmail),
    cooldownMinutes: 60,
    // This branch used to live inside voice-memo-added.tsx.
    subject: (d) =>
      d.role === "client"
        ? `${d.senderName} left you a voice note`
        : `${d.senderName} left a voice note`,
  },
  [NOTIFICATION_TYPES.FEEDBACK_RESPONSE]: {
    category: "messages",
    transactional: false,
    template: null, // Task 9
    cooldownMinutes: null,
    subject: (d) => `${d.trainerName} replied to your feedback`,
  },

  // ── Nutrition ─────────────────────────────────────────────────────────────
  [NOTIFICATION_TYPES.NUTRITION_COMMENT]: {
    category: "nutrition",
    transactional: false,
    template: null, // Task 10
    cooldownMinutes: 60,
    subject: (d) => `${d.authorName} commented on your nutrition log`,
  },
  [NOTIFICATION_TYPES.NUTRITION_REPLY]: {
    category: "nutrition",
    transactional: false,
    template: null, // Task 10
    cooldownMinutes: 60,
    subject: (d) => `${d.authorName} replied to your nutrition comment`,
  },
  [NOTIFICATION_TYPES.NUTRITION_NUDGE_MEALS]: {
    category: "nutrition",
    transactional: false,
    template: null, // Task 10
    cooldownMinutes: 1440,
    subject: () => "You have not logged your meals today",
  },
  [NOTIFICATION_TYPES.NUTRITION_NUDGE_PROTEIN]: {
    category: "nutrition",
    transactional: false,
    template: null, // Task 10
    cooldownMinutes: 1440,
    subject: () => "You are behind on your protein target",
  },
  [NOTIFICATION_TYPES.NUTRITION_NUDGE_WATER]: {
    category: "nutrition",
    transactional: false,
    template: null, // Task 10
    cooldownMinutes: 1440,
    subject: () => "You are behind on your water target",
  },

  // ── Billing (transactional — ignores preferences, no unsubscribe link) ────
  [NOTIFICATION_TYPES.PAYMENT_FAILED]: {
    category: "billing",
    transactional: true,
    template: null, // Task 11
    cooldownMinutes: null,
    subject: () => "Action required: your payment failed",
  },
  [NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED]: {
    category: "billing",
    transactional: true,
    template: null, // Task 11
    cooldownMinutes: null,
    subject: () => "Your subscription has been canceled",
  },
  [NOTIFICATION_TYPES.REFUND_PROCESSED]: {
    category: "billing",
    transactional: true,
    template: null, // Task 11
    cooldownMinutes: null,
    subject: () => "Your refund has been processed",
  },
};

void NO_SUBJECT;
```

Delete the `NO_SUBJECT` const and the trailing `void NO_SUBJECT;` line — they are scaffolding left from an earlier draft and every entry above supplies its own subject.

- [ ] **Step 5: Re-export the constants from the service**

In `lib/services/notification.service.ts`, delete the inline `NOTIFICATION_TYPES` object and the `NotificationType` type alias (currently lines 4–24) and replace with:

```ts
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";

// Re-exported so existing importers of this module keep working unchanged.
export { NOTIFICATION_TYPES };
export type { NotificationType };
```

Leave the rest of the file — `CreateNotificationInput`, `getNotificationsForUser`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `createNotification`, `createComplianceAlert` — untouched for now. `createComplianceAlert` is deleted in Task 6.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- lib/notifications/__tests__/registry.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Verify the re-export did not break any importer**

Run: `npx tsc --noEmit`
Expected: no errors. This is the real check — eight files import `NOTIFICATION_TYPES` from the service.

Run: `npm test`
Expected: all pass.

---

## Task 4: `NotificationPreference` model and preference service

**Files:**
- Modify: `prisma/schema.prisma` (add model; add relation field to `User` after line 152)
- Create: `lib/services/notification-preference.service.ts`
- Test: `lib/services/__tests__/notification-preference.service.test.ts`

**Interfaces:**
- Consumes: `NotificationType`, `NotificationCategory` (Task 3); `NOTIFICATION_REGISTRY` (Task 3).
- Produces:
  - `PreferenceValues` — `{ emailEnabled, sessions, messages, nutrition, billing }`, all `boolean`
  - `PREFERENCE_DEFAULTS: PreferenceValues`
  - `getPreference(userId: string): Promise<PreferenceValues>`
  - `getOrCreatePreference(userId: string): Promise<PreferenceValues & { unsubToken: string }>`
  - `isAllowedByPrefs(prefs: PreferenceValues, type: NotificationType): boolean` — pure
  - `isEmailAllowed(userId: string, type: NotificationType): Promise<boolean>`
  - `updatePreference(userId: string, patch: PreferencePatch): Promise<void>`
  - `PreferencePatch` — `Partial<Omit<PreferenceValues, "billing">>`
  - `resolveUnsubToken(token: string): Promise<{ userId: string } | null>`

**A refinement to spec §3.4.** The spec said a row is created on first settings save or first unsubscribe. Building the unsubscribe URL needs a token, so `notifyUser` must be able to obtain one: the row is therefore created on the first **non-transactional email**, settings save, or unsubscribe click, whichever comes first. Transactional mail carries no link, needs no token, and uses read-only `getPreference`, so billing email never creates a row.

- [ ] **Step 1: Write the failing test**

Create `lib/services/__tests__/notification-preference.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationPreference: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { NOTIFICATION_TYPES } from '@/lib/notifications/types'
import {
  PREFERENCE_DEFAULTS,
  getPreference,
  getOrCreatePreference,
  isAllowedByPrefs,
  isEmailAllowed,
  updatePreference,
  resolveUnsubToken,
} from '../notification-preference.service'

const row = {
  id: 'p1',
  userId: 'u1',
  emailEnabled: true,
  sessions: true,
  messages: false,
  nutrition: true,
  billing: true,
  unsubToken: 'tok_abc',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getPreference', () => {
  it('returns defaults and writes nothing when no row exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)

    await expect(getPreference('u1')).resolves.toEqual(PREFERENCE_DEFAULTS)
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled()
  })

  it('returns the stored row when one exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    const prefs = await getPreference('u1')

    expect(prefs.messages).toBe(false)
    expect(prefs.sessions).toBe(true)
  })

  it('fails closed to all-off when the lookup throws', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockRejectedValue(new Error('db down'))

    const prefs = await getPreference('u1')

    expect(prefs.emailEnabled).toBe(false)
  })
})

describe('getOrCreatePreference', () => {
  it('creates a row with a 64-character hex token when none exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.notificationPreference.create).mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({ ...row, ...args.data }) as never
    )

    const prefs = await getOrCreatePreference('u1')

    expect(prisma.notificationPreference.create).toHaveBeenCalledTimes(1)
    expect(prefs.unsubToken).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not create a second row when one exists', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    const prefs = await getOrCreatePreference('u1')

    expect(prisma.notificationPreference.create).not.toHaveBeenCalled()
    expect(prefs.unsubToken).toBe('tok_abc')
  })
})

describe('isAllowedByPrefs', () => {
  const on = { ...PREFERENCE_DEFAULTS }

  it('allows a type whose category is on', () => {
    expect(isAllowedByPrefs(on, NOTIFICATION_TYPES.SESSION_REMINDER)).toBe(true)
  })

  it('blocks a type whose category is muted', () => {
    expect(
      isAllowedByPrefs({ ...on, sessions: false }, NOTIFICATION_TYPES.SESSION_REMINDER)
    ).toBe(false)
  })

  it('blocks everything non-transactional when the master switch is off', () => {
    expect(
      isAllowedByPrefs({ ...on, emailEnabled: false }, NOTIFICATION_TYPES.NEW_MESSAGE)
    ).toBe(false)
  })

  it('allows a transactional type even with the master switch and category off', () => {
    expect(
      isAllowedByPrefs(
        { ...on, emailEnabled: false, billing: false },
        NOTIFICATION_TYPES.PAYMENT_FAILED
      )
    ).toBe(true)
  })

  it('blocks an unknown type', () => {
    expect(isAllowedByPrefs(on, 'NOT_A_REAL_TYPE' as never)).toBe(false)
  })
})

describe('isEmailAllowed', () => {
  it('reads the row and applies it', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    await expect(isEmailAllowed('u1', NOTIFICATION_TYPES.NEW_MESSAGE)).resolves.toBe(false)
    await expect(isEmailAllowed('u1', NOTIFICATION_TYPES.SESSION_REMINDER)).resolves.toBe(true)
  })
})

describe('updatePreference', () => {
  it('upserts the patch and generates a token on create', async () => {
    await updatePreference('u1', { messages: false, nutrition: false })

    const args = vi.mocked(prisma.notificationPreference.upsert).mock.calls[0][0] as {
      where: { userId: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }
    expect(args.where).toEqual({ userId: 'u1' })
    expect(args.update).toEqual({ messages: false, nutrition: false })
    expect(args.create.unsubToken).toMatch(/^[0-9a-f]{64}$/)
    expect(args.create.messages).toBe(false)
  })

  it('drops an attempted billing change', async () => {
    await updatePreference('u1', { billing: false, sessions: false } as never)

    const args = vi.mocked(prisma.notificationPreference.upsert).mock.calls[0][0] as {
      update: Record<string, unknown>
      create: Record<string, unknown>
    }
    expect(args.update).not.toHaveProperty('billing')
    expect(args.create.billing).toBe(true)
    expect(args.update.sessions).toBe(false)
  })

  it('ignores an empty patch without writing', async () => {
    await updatePreference('u1', {})

    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled()
  })
})

describe('resolveUnsubToken', () => {
  it('returns the userId for a known token', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(row as never)

    await expect(resolveUnsubToken('tok_abc')).resolves.toEqual({ userId: 'u1' })
  })

  it('returns null for an unknown token', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null)

    await expect(resolveUnsubToken('nope')).resolves.toBeNull()
  })

  it('returns null for an empty token without querying', async () => {
    await expect(resolveUnsubToken('')).resolves.toBeNull()
    expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/services/__tests__/notification-preference.service.test.ts`
Expected: FAIL — `Cannot find module '../notification-preference.service'`.

- [ ] **Step 3: Add the Prisma model**

In `prisma/schema.prisma`, append this model next to `model Notification` (which ends at line 899):

```prisma
model NotificationPreference {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       String   @unique @db.ObjectId
  user         User     @relation("NotificationPreference", fields: [userId], references: [id])
  emailEnabled Boolean  @default(true)
  sessions     Boolean  @default(true)
  messages     Boolean  @default(true)
  nutrition    Boolean  @default(true)
  billing      Boolean  @default(true)
  unsubToken   String   @unique
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

And add the relation field to `model User`, alongside the other relation fields (after `nutritionCommentsAuthored` at line 152):

```prisma
  notificationPreference    NotificationPreference? @relation("NotificationPreference")
```

- [ ] **Step 4: Push the schema and regenerate the client**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` The client regenerates automatically; if not, run `npx prisma generate`.

This is additive — a new collection plus one optional relation field. No existing document is read or rewritten, so there is nothing to back up and nothing to backfill.

- [ ] **Step 5: Write `lib/services/notification-preference.service.ts`**

```ts
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_REGISTRY } from "@/lib/notifications/registry";
import type { NotificationType } from "@/lib/notifications/types";

export interface PreferenceValues {
  emailEnabled: boolean;
  sessions: boolean;
  messages: boolean;
  nutrition: boolean;
  billing: boolean;
}

/** What a user with no stored row gets: everything on. */
export const PREFERENCE_DEFAULTS: PreferenceValues = {
  emailEnabled: true,
  sessions: true,
  messages: true,
  nutrition: true,
  billing: true,
};

/** `billing` is omitted — it is transactional and has no working toggle. */
export type PreferencePatch = Partial<Omit<PreferenceValues, "billing">>;

const EDITABLE_KEYS = ["emailEnabled", "sessions", "messages", "nutrition"] as const;

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function toValues(row: PreferenceValues): PreferenceValues {
  return {
    emailEnabled: row.emailEnabled,
    sessions: row.sessions,
    messages: row.messages,
    nutrition: row.nutrition,
    billing: row.billing,
  };
}

/**
 * The user's preferences, or the defaults when they have never saved any.
 * Reads only — never creates a row, so this is safe on every email send.
 *
 * Fails closed: if the lookup errors we return everything off, because
 * emailing on an unknown preference is worse than not emailing.
 */
export async function getPreference(userId: string): Promise<PreferenceValues> {
  try {
    const row = await prisma.notificationPreference.findUnique({ where: { userId } });
    return row ? toValues(row) : { ...PREFERENCE_DEFAULTS };
  } catch (err) {
    console.error(`[notification-preference] lookup failed for ${userId}:`, err);
    return { emailEnabled: false, sessions: false, messages: false, nutrition: false, billing: false };
  }
}

/**
 * Same as `getPreference`, but guarantees an `unsubToken` by creating the row
 * if it is missing. Used only for non-transactional mail, which needs an
 * unsubscribe link.
 */
export async function getOrCreatePreference(
  userId: string
): Promise<PreferenceValues & { unsubToken: string }> {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return { ...toValues(existing), unsubToken: existing.unsubToken };

  const created = await prisma.notificationPreference.create({
    data: { userId, ...PREFERENCE_DEFAULTS, unsubToken: newToken() },
  });
  return { ...toValues(created), unsubToken: created.unsubToken };
}

/**
 * Whether this type may be emailed, given these preferences. Pure.
 *
 * Category names double as the boolean field names on the model, which is what
 * makes `prefs[entry.category]` work.
 */
export function isAllowedByPrefs(prefs: PreferenceValues, type: NotificationType): boolean {
  const entry = NOTIFICATION_REGISTRY[type];
  if (!entry) return false;
  if (entry.transactional) return true;
  if (!prefs.emailEnabled) return false;
  return prefs[entry.category];
}

export async function isEmailAllowed(userId: string, type: NotificationType): Promise<boolean> {
  return isAllowedByPrefs(await getPreference(userId), type);
}

/**
 * Applies a patch, creating the row if needed. Any `billing` key is dropped:
 * billing mail is transactional, and accepting the field would imply a control
 * that does not exist.
 */
export async function updatePreference(userId: string, patch: PreferencePatch): Promise<void> {
  const clean: PreferencePatch = {};
  for (const key of EDITABLE_KEYS) {
    if (typeof patch[key] === "boolean") clean[key] = patch[key];
  }
  if (Object.keys(clean).length === 0) return;

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...PREFERENCE_DEFAULTS, ...clean, unsubToken: newToken() },
    update: clean,
  });
}

/** Resolves an unsubscribe token to its owner. Null for anything unrecognised. */
export async function resolveUnsubToken(token: string): Promise<{ userId: string } | null> {
  if (!token) return null;
  try {
    const row = await prisma.notificationPreference.findUnique({ where: { unsubToken: token } });
    return row ? { userId: row.userId } : null;
  } catch (err) {
    console.error("[notification-preference] token lookup failed:", err);
    return null;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- lib/services/__tests__/notification-preference.service.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` — no errors. If `prisma.notificationPreference` is unknown, Step 4 did not regenerate; run `npx prisma generate`.

---
## Task 5: The `notifyUser` dispatcher

The centre of the system. Everything before this task exists to be called from here; everything after it is a call site.

**Files:**
- Modify: `lib/services/notification.service.ts` (add `notifyUser` and its imports)
- Test: `lib/services/__tests__/notify-user.test.ts`

**Interfaces:**
- Consumes: `sendEmail` (Task 1), `appBaseUrl` (Task 1), `NOTIFICATION_REGISTRY` (Task 3), `getPreference` / `getOrCreatePreference` / `isAllowedByPrefs` (Task 4), and the existing `createNotification` in the same file. Note it does **not** import `CATEGORY_LABELS` — the unsubscribe URL carries the raw category key, and the label is applied by the template.
- Produces:
  - `NotifyUserInput` — `{ userId, type, title, body?, link?, metadata?, email?, recipientEmail?, recipientName? }`
  - `notifyUser(input: NotifyUserInput): Promise<void>`

Every template receives `recipientName` and `unsubscribeUrl` merged over the caller's `email` payload, so no call site assembles those two itself.

- [ ] **Step 1: Write the failing test**

The registry is mocked so the dispatcher can be tested against all four entry shapes — emailing, in-app-only, cooled-down, transactional — before Tasks 9–11 fill in the real templates. `notification-preference.service` is **not** mocked: it reads the mocked registry too, so allowance logic stays consistent with the fixture.

Create `lib/services/__tests__/notify-user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'

const FakeTemplate = () => React.createElement('div', null, 'body')

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { create: vi.fn(), findFirst: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))

vi.mock('@/lib/notifications/registry', () => ({
  NOTIFICATION_REGISTRY: {
    SESSION_REMINDER: {
      category: 'sessions',
      transactional: false,
      template: FakeTemplate,
      subject: (d: Record<string, unknown>) => `Reminder: ${d.workoutName}`,
      cooldownMinutes: null,
    },
    NEW_MESSAGE: {
      category: 'messages',
      transactional: false,
      template: FakeTemplate,
      subject: (d: Record<string, unknown>) => `New message from ${d.senderName}`,
      cooldownMinutes: 60,
    },
    EXERCISE_NOTE: {
      category: 'sessions',
      transactional: false,
      template: null,
      subject: () => '',
      cooldownMinutes: null,
    },
    PAYMENT_FAILED: {
      category: 'billing',
      transactional: true,
      template: FakeTemplate,
      subject: () => 'Action required: your payment failed',
      cooldownMinutes: null,
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { notifyUser } from '../notification.service'

const PREFS_ALL_ON = {
  id: 'p1', userId: 'u1', emailEnabled: true,
  sessions: true, messages: true, nutrition: true, billing: true,
  unsubToken: 'tok_abc',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(prisma.notification.create).mockResolvedValue({ id: 'n_new' } as never)
  vi.mocked(prisma.notification.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(PREFS_ALL_ON as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Lee',
  } as never)
  vi.mocked(sendEmail).mockResolvedValue(true)
})

const reminder = {
  userId: 'u1',
  type: 'SESSION_REMINDER' as never,
  title: 'Session Reminder',
  body: 'Tomorrow',
  link: '/sessions',
  email: { workoutName: 'Lower Body A' },
}

describe('notifyUser — the in-app notification is never gated', () => {
  it('creates it before any other work', async () => {
    await notifyUser(reminder)
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('creates it even when the category is muted', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      ...PREFS_ALL_ON, sessions: false,
    } as never)

    await notifyUser(reminder)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('creates it even when the master switch is off', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      ...PREFS_ALL_ON, emailEnabled: false,
    } as never)

    await notifyUser(reminder)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('creates it even when the send fails', async () => {
    vi.mocked(sendEmail).mockResolvedValue(false)

    await notifyUser(reminder)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })

  it('creates it for an in-app-only type and sends nothing', async () => {
    await notifyUser({ ...reminder, type: 'EXERCISE_NOTE' as never })

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('creates it for a type missing from the registry, and logs', async () => {
    await notifyUser({ ...reminder, type: 'GHOST_TYPE' as never })

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('notifyUser — sending', () => {
  it('sends with the registry subject and the resolved recipient', async () => {
    await notifyUser(reminder)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const args = vi.mocked(sendEmail).mock.calls[0][0]
    expect(args.to).toBe('sarah@example.com')
    expect(args.subject).toBe('Reminder: Lower Body A')
  })

  it('merges recipientName and unsubscribeUrl into the template props', async () => {
    await notifyUser(reminder)

    const props = vi.mocked(sendEmail).mock.calls[0][0].react.props as Record<string, unknown>
    expect(props.workoutName).toBe('Lower Body A')
    expect(props.recipientName).toBe('Sarah Lee')
    expect(props.unsubscribeUrl).toBe(
      'https://app.test/api/notifications/unsubscribe?token=tok_abc&category=sessions'
    )
  })

  it('skips the user lookup when the caller supplies the address and name', async () => {
    await notifyUser({ ...reminder, recipientEmail: 'direct@example.com', recipientName: 'Direct' })

    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe('direct@example.com')
  })

  it('skips the send when the user has no email address', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)

    await notifyUser(reminder)

    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })
})

describe('notifyUser — cooldown', () => {
  const message = {
    userId: 'u1',
    type: 'NEW_MESSAGE' as never,
    title: 'New message',
    email: { senderName: 'Mike Chen' },
  }

  it('suppresses the email when a same-type notification is inside the window', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: 'n_old' } as never)

    await notifyUser(message)

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('excludes the row it just created from the cooldown query', async () => {
    await notifyUser(message)

    const where = vi.mocked(prisma.notification.findFirst).mock.calls[0][0]!.where as {
      id: { not: string }
      type: string
      userId: string
    }
    expect(where.id).toEqual({ not: 'n_new' })
    expect(where.type).toBe('NEW_MESSAGE')
    expect(where.userId).toBe('u1')
  })

  it('queries the window from the registry cooldown', async () => {
    const before = Date.now()

    await notifyUser(message)

    const where = vi.mocked(prisma.notification.findFirst).mock.calls[0][0]!.where as {
      createdAt: { gte: Date }
    }
    const windowMs = before - where.createdAt.gte.getTime()
    expect(windowMs).toBeGreaterThanOrEqual(60 * 60_000 - 1000)
    expect(windowMs).toBeLessThanOrEqual(60 * 60_000 + 1000)
  })

  it('does not query at all for a type with no cooldown', async () => {
    await notifyUser(reminder)

    expect(prisma.notification.findFirst).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('notifyUser — transactional mail', () => {
  const payment = {
    userId: 'u1',
    type: 'PAYMENT_FAILED' as never,
    title: 'Payment failed',
    email: { amountDue: '$49.00' },
  }

  it('sends even with the master switch and the category off', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      ...PREFS_ALL_ON, emailEnabled: false, billing: false,
    } as never)

    await notifyUser(payment)

    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('carries no unsubscribe URL and creates no preference row', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null as never)

    await notifyUser(payment)

    const props = vi.mocked(sendEmail).mock.calls[0][0].react.props as Record<string, unknown>
    expect(props.unsubscribeUrl).toBeUndefined()
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled()
  })
})

describe('notifyUser — never throws', () => {
  it('swallows a rejected send', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('boom'))
    await expect(notifyUser(reminder)).resolves.toBeUndefined()
  })

  it('swallows a rejected preference lookup', async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockRejectedValue(new Error('db down'))
    await expect(notifyUser(reminder)).resolves.toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('swallows a rejected cooldown query', async () => {
    vi.mocked(prisma.notification.findFirst).mockRejectedValue(new Error('db down'))
    await expect(
      notifyUser({ userId: 'u1', type: 'NEW_MESSAGE' as never, title: 'T', email: {} })
    ).resolves.toBeUndefined()
  })

  it('swallows a subject function that throws', async () => {
    await expect(
      notifyUser({ userId: 'u1', type: 'SESSION_REMINDER' as never, title: 'T' })
    ).resolves.toBeUndefined()
  })
})
```

Note the last test: `reminder.email` is omitted, so `subject` receives `workoutName: undefined` and returns `"Reminder: undefined"`. It does not throw — the assertion is only that `notifyUser` resolves. This is the runtime-prop trade-off documented in Task 3.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/services/__tests__/notify-user.test.ts`
Expected: FAIL — `notifyUser is not a function`.

- [ ] **Step 3: Add the imports to `lib/services/notification.service.ts`**

Alongside the existing `prisma` and `Prisma` imports and the Task 3 re-export:

```ts
import * as React from "react";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/utils/app-url";
import { NOTIFICATION_REGISTRY } from "@/lib/notifications/registry";
import {
  getPreference,
  getOrCreatePreference,
  isAllowedByPrefs,
} from "@/lib/services/notification-preference.service";
```

- [ ] **Step 4: Add `notifyUser` at the end of the file**

```ts
export interface NotifyUserInput extends Omit<CreateNotificationInput, "type"> {
  type: NotificationType;
  /** Extra props for the template, merged under `recipientName`/`unsubscribeUrl`. */
  email?: Record<string, unknown>;
  /** Supply to skip the User lookup when the caller already has the address. */
  recipientEmail?: string;
  recipientName?: string;
}

/**
 * Creates an in-app notification and, if the registry and the user's
 * preferences allow it, sends the matching email.
 *
 * Never throws. The in-app notification is the durable record; email is
 * best-effort, and no caller may fail because of it.
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  // 1. The in-app notification, always and first.
  const created = await createNotification(input);

  try {
    // 2. Registry.
    const entry = NOTIFICATION_REGISTRY[input.type];
    if (!entry) {
      console.error(`[notify] no registry entry for type "${input.type}"`);
      return;
    }
    if (!entry.template) return;

    // 3. Preferences. Transactional mail needs no unsubscribe token, so it
    //    reads without ever creating a row.
    let unsubscribeUrl: string | undefined;
    if (entry.transactional) {
      if (!isAllowedByPrefs(await getPreference(input.userId), input.type)) return;
    } else {
      const prefs = await getOrCreatePreference(input.userId);
      if (!isAllowedByPrefs(prefs, input.type)) return;
      unsubscribeUrl =
        `${appBaseUrl()}/api/notifications/unsubscribe` +
        `?token=${prefs.unsubToken}&category=${entry.category}`;
    }

    // 4. Cooldown, excluding the row created in step 1.
    if (entry.cooldownMinutes !== null) {
      const since = new Date(Date.now() - entry.cooldownMinutes * 60_000);
      const recent = await prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          id: { not: created.id },
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    // 5. Recipient.
    let to = input.recipientEmail;
    let recipientName = input.recipientName;
    if (!to || !recipientName) {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (!user?.email) {
        console.error(`[notify] no email address for user ${input.userId}`);
        return;
      }
      to = to ?? user.email;
      recipientName = recipientName ?? `${user.firstName} ${user.lastName}`.trim();
    }

    // 6. Render and send.
    const data: Record<string, unknown> = { ...input.email, recipientName, unsubscribeUrl };
    await sendEmail({
      to,
      subject: entry.subject(data),
      react: React.createElement(entry.template, data),
    });
  } catch (err) {
    console.error(`[notify] email step failed for ${input.type} / user ${input.userId}:`, err);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- lib/services/__tests__/notify-user.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` and `npm test` — all pass.

---

## Task 6: Migrate the five existing sends onto the dispatcher

No user-visible change. This proves the dispatcher against flows that already work, and fixes both unguarded-throw bugs from spec §1.

**Files:**
- Modify: `app/api/reminders/route.ts:1-10, 96-137`
- Modify: `actions/session-v2-actions.ts:1-11, 44-64, 104-112`
- Modify: `actions/compliance-actions.ts:1-10, 80-116`
- Modify: `actions/program-actions.ts:27, 989-1006`
- Modify: `lib/email/send-program-welcome.ts` (whole file)
- Modify: `lib/services/notification.service.ts` (delete `createComplianceAlert`)
- Modify: `actions/__tests__/session-v2-actions.test.ts:15-19`
- Test: `actions/__tests__/compliance-actions.test.ts` (create)

**Interfaces:**
- Consumes: `notifyUser` (Task 5), `sendEmail` (Task 1), `appBaseUrl` (Task 1).
- Produces: nothing new. This task only removes code.

- [ ] **Step 1: Delete the dead `createComplianceAlert`**

`grep -rn "createComplianceAlert" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.claude .` returns only its own definition in `lib/services/notification.service.ts`. It has no callers: `actions/compliance-actions.ts` builds its notification with a raw `prisma.notification.create` instead.

Delete the whole `createComplianceAlert` function from `lib/services/notification.service.ts`.

Run: `npx tsc --noEmit`
Expected: no errors, confirming it really was unreferenced.

- [ ] **Step 2: Migrate `actions/session-v2-actions.ts`**

In `notifyTrainerOnCompletion`, replace the `createNotification` call **and** the bare `getResend().emails.send()` block that follows it with a single call:

```ts
  await notifyUser({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.SESSION_COMPLETED,
    title: "Session Completed",
    body: `${clientName} completed "${workoutName}".`,
    link: clientLink,
    metadata: { clientId: client.id, clientName, workoutName, programId },
    recipientEmail: trainer.email,
    recipientName: `${trainer.firstName} ${trainer.lastName}`,
    // SessionCompletedEmail's own prop is `trainerName`, not `recipientName`,
    // and Task 2 preserved existing prop names — so pass it explicitly.
    email: {
      trainerName: `${trainer.firstName} ${trainer.lastName}`,
      clientName,
      workoutName,
      programName,
      clientLink,
    },
  });
```

In `notifyTrainerOfClientNotes`, swap `createNotification` for `notifyUser` with the same arguments plus an `email` payload. The trainer select there is `{ id: true }` only, so **widen it** to `{ id: true, email: true, firstName: true, lastName: true }` and pass `recipientEmail` / `recipientName`:

```ts
  await notifyUser({
    userId: trainer.id,
    type: NOTIFICATION_TYPES.EXERCISE_NOTE,
    title: "New exercise note",
    body: `${clientName} left a note on ${summary} in "${workoutName}".`,
    link,
    metadata: { clientId: client.id, clientName, workoutName, sessionId, exerciseCount: exerciseNames.length },
    recipientEmail: trainer.email,
    recipientName: `${trainer.firstName} ${trainer.lastName}`,
    email: { clientName, workoutName, summary, sessionLink: link },
  });
```

`EXERCISE_NOTE` still has `template: null` until Task 9, so this sends nothing yet — the notification behaves exactly as before.

Then update the imports: drop `React`, `getResend`, and `SessionCompletedEmail`; replace `createNotification` with `notifyUser`. Also replace the two inline `process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app"` expressions with `appBaseUrl()`.

- [ ] **Step 3: Update the session-v2 test mocks**

`actions/__tests__/session-v2-actions.test.ts:15-19` mocks `createNotification` and `getResend`. Replace with:

```ts
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: {
    SESSION_COMPLETED: 'SESSION_COMPLETED',
    EXERCISE_NOTE: 'EXERCISE_NOTE',
  },
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))
```

Read the file first — it may reference other `NOTIFICATION_TYPES` keys, and every key the module under test touches must be present in the mock.

Run: `npm test -- actions/__tests__/session-v2-actions.test.ts`
Expected: PASS.

- [ ] **Step 4: Migrate `actions/compliance-actions.ts`**

Replace the raw `prisma.notification.create({ data: { ... } })` at :80-97 and the guarded `getResend().emails.send()` block at :99-116 with one call. The surrounding loop, `LOOKBACK_DAYS`, and the `alerted++` counter stay exactly as they are:

```ts
      await notifyUser({
        userId: trainer.id,
        type: NOTIFICATION_TYPES.MISSED_SESSION,
        title: "Missed Sessions Alert",
        body: `${clientName} has missed ${missedCount} session${missedCount !== 1 ? "s" : ""} in the last 14 days.`,
        link: "/clients",
        metadata: { clientId: client.id, clientName, missedCount },
        recipientEmail: trainer.email,
        recipientName: `${trainer.firstName} ${trainer.lastName}`,
        email: {
          // MissedSessionEmail declares `trainerName`, not `recipientName`.
          trainerName: `${trainer.firstName} ${trainer.lastName}`,
          clientName,
          missedCount,
          lookbackDays: LOOKBACK_DAYS,
          clientLink: `${appBaseUrl()}/clients`,
        },
      });
```

Drop the now-unused `React`, `getResend`, `MissedSessionEmail`, and `Prisma` imports (check whether `Prisma` is used elsewhere in the file before removing it).

**Behavior change to be aware of:** the notification body previously said "the last 14 days" as a literal while the email used `LOOKBACK_DAYS`. Keep the literal as-is to avoid changing existing copy, but note that if `LOOKBACK_DAYS` is not 14 the two disagree. Check its value; if it is 14, no action. If it is not, use `the last ${LOOKBACK_DAYS} days` in the body and say so in the task report.

- [ ] **Step 5: Write a test for the compliance migration**

Create `actions/__tests__/compliance-actions.test.ts`. Read the top of `actions/compliance-actions.ts` first to mirror its auth helper and Prisma model usage in the mocks. Assert:

```ts
  it('notifies the trainer once per client with the missed count', async () => {
    // ...arrange a trainer with one client over the missed-session threshold
    await runComplianceCheck()

    expect(notifyUser).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('MISSED_SESSION')
    expect(arg.userId).toBe('trainer1')
    expect(arg.recipientEmail).toBe('trainer@example.com')
    expect(arg.email).toMatchObject({ clientName: 'Sarah Lee', missedCount: 3 })
  })

  it('does not throw when notifyUser rejects', async () => {
    vi.mocked(notifyUser).mockRejectedValue(new Error('boom'))
    await expect(runComplianceCheck()).resolves.toMatchObject({ alerted: 0 })
  })
```

Use the action's real exported name in place of `runComplianceCheck` — read the file for it.

- [ ] **Step 6: Migrate `app/api/reminders/route.ts`**

Replace the `getResend().emails.send()` block (including its `try/catch` and `continue`) and the `createNotification` call that follows with one `notifyUser`:

```ts
      await notifyUser({
        userId: client.id,
        type: NOTIFICATION_TYPES.SESSION_REMINDER,
        title: "Session Reminder",
        body: `Your workout "${workout.name}" is scheduled for ${sessionDate} at ${sessionTime}.`,
        link: sessionLink,
        metadata: { sessionId: session.id, sessionDate, sessionTime, workoutName: workout.name },
        recipientEmail: client.email,
        recipientName: clientName,
        email: {
          clientName,
          sessionDate,
          sessionTime,
          workoutName: workout.name,
          sessionLink,
        },
      });
      sent++;
```

The `alreadyRemindedSessionIds` dedup above it is unchanged — it is the per-session guard that replaces a cooldown for this type. Drop the `React`, `getResend`, and `SessionReminderEmail` imports, and use `appBaseUrl()` for the base URL.

**Note:** `sent` now counts notifications created rather than emails delivered, since `notifyUser` does not report whether the email went out. That is the correct meaning for this endpoint — the reminder was recorded — but say so in the task report.

- [ ] **Step 7: Migrate the two email-only flows**

These stay **outside** the dispatcher: neither has an in-app recipient to notify.

`lib/email/send-program-welcome.ts` — swap the `getResend().emails.send()` call for `sendEmail`, returning nothing as before:

```ts
import * as React from "react";
import { sendEmail } from "@/lib/email/send";
import { ProgramWelcomeEmail } from "@/lib/email/templates/program-welcome";

export async function sendProgramWelcomeEmail(args: {
  to: string;
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: args.isNewAccount
      ? `Welcome — set up your ${args.programName} account`
      : `Your new program: ${args.programName}`,
    react: React.createElement(ProgramWelcomeEmail, {
      firstName: args.firstName,
      programName: args.programName,
      loginUrl: args.loginUrl,
      isNewAccount: args.isNewAccount,
    }),
  });
}
```

Because `sendEmail` cannot throw, this alone fixes the spurious-`FAILED` bug: a Resend outage no longer escapes `fulfillProgramPurchase` into the webhook's `after()` handler and marks a completed purchase failed.

`actions/program-actions.ts` — the share flow is the one place a send failure **should** reach the user, since they clicked Share and are waiting. Keep the error return, driven by the boolean:

```ts
  const ok = await sendEmail({
    to: recipients,
    subject: `Your exercise plan: ${program.name}`,
    react: React.createElement(ShareProgramEmail, {
      programName: program.name,
      clientName,
      senderName,
      pdfLink,
    }),
  });

  if (!ok) return { success: false, error: "Failed to send email" };
  return { success: true };
```

Delete the surrounding `try/catch` — `sendEmail` handles and logs the failure. Replace the `getResend` import with `sendEmail`, and use `appBaseUrl()`.

- [ ] **Step 8: Verify the whole migration**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass, including the updated `session-v2-actions` and new `compliance-actions` tests.

Run: `grep -rn "getResend" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=.next . | grep -v "lib/email/resend.ts" | grep -v "lib/email/send.ts" | grep -v "__tests__"`
Expected: **no output.** Every production `getResend()` call now goes through `sendEmail`. This is the key check for this task.

Run: `grep -rn 'NEXT_PUBLIC_APP_URL ?? "https://inmotusrx' --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.claude .`
Expected: only `lib/utils/app-url.ts`.

Run: `npm run lint`
Expected: clean.

---
## Task 7: Unsubscribe route

**Files:**
- Create: `app/api/notifications/unsubscribe/route.ts`
- Test: `app/api/notifications/__tests__/unsubscribe.test.ts`

**Interfaces:**
- Consumes: `resolveUnsubToken`, `updatePreference` (Task 4); `CATEGORY_LABELS`, `NotificationCategory` (Task 3).
- Produces: `GET(request: Request)` and `POST(request: Request)` route handlers.

**A deliberate deviation from spec §5.1, which said one-click GET.** Gmail, Outlook, and several security gateways prefetch links in email bodies. A GET that mutates would let a scanner silently unsubscribe a user who never clicked. So:

- **GET renders a confirmation page** with a single button and no side effects. Safe to prefetch.
- **POST applies the change.** The button submits a form carrying the token and category.

It costs one extra click and removes a class of silent data loss. The alternative — keeping mutation on GET — is the more common industry choice, and if the user prefers it, delete the GET branch's form and move the `updatePreference` calls into it.

- [ ] **Step 1: Write the failing test**

Create `app/api/notifications/__tests__/unsubscribe.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/notification-preference.service', () => ({
  resolveUnsubToken: vi.fn(),
  updatePreference: vi.fn(),
}))

import { resolveUnsubToken, updatePreference } from '@/lib/services/notification-preference.service'
import { GET, POST } from '../unsubscribe/route'

const url = (qs: string) => `https://app.test/api/notifications/unsubscribe${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveUnsubToken).mockResolvedValue({ userId: 'u1' })
})

describe('GET — confirmation only, never mutates', () => {
  it('renders a confirm form for a valid token and category', async () => {
    const res = await GET(new Request(url('?token=tok_abc&category=messages')))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('message emails')
    expect(body).toContain('<form')
    expect(body).toContain('tok_abc')
    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('never mutates, so a link prefetch is harmless', async () => {
    await GET(new Request(url('?token=tok_abc')))
    await GET(new Request(url('?token=tok_abc&category=nutrition')))

    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('shows the neutral invalid page for an unknown token', async () => {
    vi.mocked(resolveUnsubToken).mockResolvedValue(null)

    const res = await GET(new Request(url('?token=nope&category=messages')))
    const body = await res.text()

    expect(body).toContain('invalid or expired')
    expect(body).not.toContain('<form')
  })

  it('reveals nothing about whether an address exists', async () => {
    vi.mocked(resolveUnsubToken).mockResolvedValue(null)

    const body = await (await GET(new Request(url('?token=nope')))).text()

    expect(body).not.toMatch(/not found|no such user|does not exist/i)
  })
})

describe('POST — applies the change', () => {
  const post = (qs: string) => POST(new Request(url(qs), { method: 'POST' }))

  it('mutes one category', async () => {
    const body = await (await post('?token=tok_abc&category=messages')).text()

    expect(updatePreference).toHaveBeenCalledWith('u1', { messages: false })
    expect(body).toContain('unsubscribed from message emails')
    expect(body).toContain('still see these in the app')
  })

  it('mutes all email when no category is given', async () => {
    await post('?token=tok_abc')

    expect(updatePreference).toHaveBeenCalledWith('u1', { emailEnabled: false })
  })

  it('accepts sessions and nutrition', async () => {
    await post('?token=tok_abc&category=sessions')
    await post('?token=tok_abc&category=nutrition')

    expect(updatePreference).toHaveBeenNthCalledWith(1, 'u1', { sessions: false })
    expect(updatePreference).toHaveBeenNthCalledWith(2, 'u1', { nutrition: false })
  })

  it('rejects billing, which carries no unsubscribe link', async () => {
    const body = await (await post('?token=tok_abc&category=billing')).text()

    expect(updatePreference).not.toHaveBeenCalled()
    expect(body).toContain('invalid or expired')
  })

  it('rejects an unknown category', async () => {
    await post('?token=tok_abc&category=haircuts')

    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('writes nothing for an unknown token', async () => {
    vi.mocked(resolveUnsubToken).mockResolvedValue(null)

    await post('?token=nope&category=messages')

    expect(updatePreference).not.toHaveBeenCalled()
  })

  it('links back to the settings page', async () => {
    const body = await (await post('?token=tok_abc&category=messages')).text()

    expect(body).toContain('/settings/notifications')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/api/notifications/__tests__/unsubscribe.test.ts`
Expected: FAIL — `Cannot find module '../unsubscribe/route'`.

- [ ] **Step 3: Write `app/api/notifications/unsubscribe/route.ts`**

The page is self-contained HTML with inline styles, not a React page: it must render for a signed-out visitor arriving from a mail client, outside the app shell and its providers.

```ts
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
    headers: { "Content-Type": "text/html; charset=utf-8" },
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
  const action = `${appBaseUrl()}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}${
    category ? `&category=${category}` : ""
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/api/notifications/__tests__/unsubscribe.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` and `npm run lint` — clean. The inline `<style>` block is plain CSS in a string, not Tailwind, so the `no-raw-palette` rule does not apply; if the rule's file glob flags it anyway, note it in the task report rather than working around it.

---

## Task 8: Settings page, form, actions, and navigation

**Files:**
- Create: `actions/notification-preference-actions.ts`
- Create: `components/settings/notification-preferences-form.tsx`
- Create: `app/(platform)/settings/notifications/page.tsx`
- Modify: `components/layout/sidebar.tsx:86-89, 179-184`
- Test: `actions/__tests__/notification-preference-actions.test.ts`

**Interfaces:**
- Consumes: `getPreference`, `updatePreference`, `PreferenceValues`, `PreferencePatch` (Task 4); `getCurrentUser` from `lib/current-user.ts` (existing).
- Produces:
  - `getMyPreferenceAction(): Promise<PreferenceValues>`
  - `updateMyPreferenceAction(patch: PreferencePatch): Promise<{ success: true } | { success: false; error: string }>`
  - `NotificationPreferencesForm({ initial }: { initial: PreferenceValues })`

**A gap the spec did not cover.** The settings sub-nav in `components/layout/sidebar.tsx:179` is gated on `role === "TRAINER"`, but clients need this page too — they are the ones receiving session reminders and nutrition nudges. This task makes the sub-nav block render for both roles, with Organization and Audit Log still trainer-only inside it.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/notification-preference-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/services/notification-preference.service', () => ({
  getPreference: vi.fn(),
  updatePreference: vi.fn(),
  PREFERENCE_DEFAULTS: {
    emailEnabled: true, sessions: true, messages: true, nutrition: true, billing: true,
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { getPreference, updatePreference } from '@/lib/services/notification-preference.service'
import { revalidatePath } from 'next/cache'
import { getMyPreferenceAction, updateMyPreferenceAction } from '../notification-preference-actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' } as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getMyPreferenceAction', () => {
  it('returns the current user preferences', async () => {
    vi.mocked(getPreference).mockResolvedValue({
      emailEnabled: true, sessions: false, messages: true, nutrition: true, billing: true,
    })

    await expect(getMyPreferenceAction()).resolves.toMatchObject({ sessions: false })
    expect(getPreference).toHaveBeenCalledWith('u1')
  })
})

describe('updateMyPreferenceAction', () => {
  it('writes the patch for the current user and revalidates', async () => {
    const res = await updateMyPreferenceAction({ messages: false })

    expect(res).toEqual({ success: true })
    expect(updatePreference).toHaveBeenCalledWith('u1', { messages: false })
    expect(revalidatePath).toHaveBeenCalledWith('/settings/notifications')
  })

  it('strips any key that is not an editable boolean', async () => {
    await updateMyPreferenceAction({
      messages: false, billing: false, userId: 'someone-else', emailEnabled: 'yes',
    } as never)

    expect(updatePreference).toHaveBeenCalledWith('u1', { messages: false })
  })

  it('returns an error instead of throwing when the write fails', async () => {
    vi.mocked(updatePreference).mockRejectedValue(new Error('db down'))

    await expect(updateMyPreferenceAction({ messages: false })).resolves.toEqual({
      success: false,
      error: 'Failed to save notification preferences',
    })
  })

  it('returns an error when there is no signed-in user', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'))

    await expect(updateMyPreferenceAction({ messages: false })).resolves.toMatchObject({
      success: false,
    })
    expect(updatePreference).not.toHaveBeenCalled()
  })
})
```

The third test matters: a server action's argument crosses the network, so it is untrusted input. `userId` and `billing` must be impossible to set from the client.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- actions/__tests__/notification-preference-actions.test.ts`
Expected: FAIL — `Cannot find module '../notification-preference-actions'`.

- [ ] **Step 3: Write `actions/notification-preference-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import {
  getPreference,
  updatePreference,
  type PreferencePatch,
  type PreferenceValues,
} from "@/lib/services/notification-preference.service";

const EDITABLE_KEYS = ["emailEnabled", "sessions", "messages", "nutrition"] as const;

export async function getMyPreferenceAction(): Promise<PreferenceValues> {
  const user = await getCurrentUser();
  return getPreference(user.id);
}

/**
 * Saves the signed-in user's preferences.
 *
 * The patch arrives from the client, so it is filtered to the four editable
 * boolean keys. `userId` cannot be spoofed and `billing` cannot be set.
 */
export async function updateMyPreferenceAction(
  patch: PreferencePatch
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getCurrentUser();

    const clean: PreferencePatch = {};
    for (const key of EDITABLE_KEYS) {
      if (typeof patch?.[key] === "boolean") clean[key] = patch[key];
    }

    await updatePreference(user.id, clean);
    revalidatePath("/settings/notifications");
    return { success: true };
  } catch (err) {
    console.error("Failed to save notification preferences:", err);
    return { success: false, error: "Failed to save notification preferences" };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- actions/__tests__/notification-preference-actions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `components/settings/notification-preferences-form.tsx`**

Follows the `components/settings/organization-profile-form.tsx` pattern: client component, local state, `sonner` toast, `router.refresh()`. Uses the existing `Switch` (`components/ui/switch.tsx`) and `FormSection` (`components/shared/form-section.tsx`). Semantic tokens only.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/shared/form-section";
import { updateMyPreferenceAction } from "@/actions/notification-preference-actions";
import type { PreferenceValues } from "@/lib/services/notification-preference.service";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const CATEGORIES = [
  {
    key: "sessions" as const,
    label: "Sessions",
    description: "Reminders, completions, missed sessions, and exercise notes",
  },
  {
    key: "messages" as const,
    label: "Messages & check-ins",
    description: "New messages, check-ins assigned, responses, and voice memos",
  },
  {
    key: "nutrition" as const,
    label: "Nutrition",
    description: "Coach comments and daily nudges",
  },
];

export function NotificationPreferencesForm({ initial }: { initial: PreferenceValues }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    emailEnabled: initial.emailEnabled,
    sessions: initial.sessions,
    messages: initial.messages,
    nutrition: initial.nutrition,
  });

  async function handleSave() {
    setSaving(true);
    const result = await updateMyPreferenceAction(values);
    setSaving(false);

    if (result.success) {
      toast.success("Notification preferences saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <FormSection
        title="Email notifications"
        description="Turn this off to stop all non-essential email. You will still see every notification in the app."
      >
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="emailEnabled" className="text-sm font-medium">
            Send me email notifications
          </Label>
          <Switch
            id="emailEnabled"
            checked={values.emailEnabled}
            onCheckedChange={(checked) => setValues((v) => ({ ...v, emailEnabled: checked }))}
          />
        </div>
      </FormSection>

      <FormSection title="Categories" description="Choose which emails you want to receive.">
        {CATEGORIES.map((category) => (
          <div key={category.key} className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={category.key} className="text-sm font-medium">
                {category.label}
              </Label>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
            <Switch
              id={category.key}
              checked={values[category.key]}
              disabled={!values.emailEnabled}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, [category.key]: checked }))
              }
            />
          </div>
        ))}

        <div className="flex items-start justify-between gap-4 border-t border-border pt-6">
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-medium text-muted-foreground">Billing</Label>
            <p className="text-sm text-muted-foreground">
              Payment failures, cancellations, and refunds. Always sent — required for account
              access.
            </p>
          </div>
          <Switch checked disabled aria-label="Billing emails are always sent" />
        </div>
      </FormSection>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `app/(platform)/settings/notifications/page.tsx`**

Mirrors `app/(platform)/settings/clinic/page.tsx`, but with **no `requireRole` call** — both trainers and clients need this page. `getMyPreferenceAction` calls `getCurrentUser`, which enforces authentication on its own.

```tsx
import { getMyPreferenceAction } from "@/actions/notification-preference-actions";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function NotificationSettingsPage() {
  const preferences = await getMyPreferenceAction();

  return (
    <PageShell width="narrow">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
        <PageHeader
          title="Notifications"
          description="Choose which emails you receive. In-app notifications are always on."
          className="pb-0"
        />
      </div>
      <NotificationPreferencesForm initial={preferences} />
    </PageShell>
  );
}
```

- [ ] **Step 7: Add the sidebar entry for both roles**

In `components/layout/sidebar.tsx`, add the href to `accountHrefs` (line 86-89) so the active-state "longest prefix wins" logic can match it. It goes outside the trainer-only spread:

```ts
  const accountHrefs = [
    "/settings",
    "/settings/notifications",
    ...(role === "TRAINER" ? ["/settings/clinic", "/settings/billing", "/settings/audit-log"] : []),
  ];
```

Then change the sub-nav block at line 179. It is currently gated on `role === "TRAINER"`; the gate moves inward so clients see Notifications:

```tsx
        {pathname.startsWith("/settings") && !pathname.startsWith("/settings/billing") && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 pl-2">
            {navItem("/settings/notifications", "Notifications", Bell)}
            {role === "TRAINER" && navItem("/settings/clinic", "Organization", Building2)}
            {role === "TRAINER" && navItem("/settings/audit-log", "Audit Log", History)}
          </div>
        )}
```

Add `Bell` to the existing `lucide-react` import. Check whether `Bell` is already imported for the notification bell — if so, reuse it.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit` and `npm run lint` — clean. Lint matters here: this is the first task writing Tailwind, and `no-raw-palette` is a hard error.

Run: `npm test`
Expected: all pass.

Manual check — start `npm run dev` and confirm:
- `/settings/notifications` loads as a trainer and as a client.
- Toggling the master switch disables the three category switches.
- Save shows the success toast, and the values survive a reload.
- Billing renders disabled and on.
- The sidebar shows Notifications under Settings for both roles.

---
## Task 9: Messaging emails

**Files:**
- Create: `lib/email/templates/new-message.tsx`
- Create: `lib/email/templates/exercise-note.tsx`
- Modify: `lib/notifications/registry.ts` (fill in `NEW_MESSAGE` and `EXERCISE_NOTE` templates)
- Modify: `actions/message-actions.ts:87-130, 190-262, 285-340`
- Modify: `actions/voice-memo-actions.ts` (in `confirmVoiceMemoUpload`)
- Modify: `actions/__tests__/voice-memo-actions.test.ts:33`
- Test: `actions/__tests__/message-actions.notify.test.ts`

**Interfaces:**
- Consumes: `EmailLayout` (Task 2), `notifyUser` (Task 5), `tpl` (Task 3), `appBaseUrl` (Task 1).
- Produces: `NewMessageEmail`, `ExerciseNoteEmail`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/message-actions.notify.test.ts`. Read `actions/message-actions.ts:1-30` first and mirror its imports in the mocks — it uses `auth` from `@clerk/nextjs/server`, `prisma`, `messageService`, `pusherServer`, `revalidatePath`, and `getClientIdsForTrainer`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_t1' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { NEW_MESSAGE: 'NEW_MESSAGE' },
}))
// Mock prisma, messageService, pusherServer, and getClientIdsForTrainer to
// match the module's real import paths — read the file for them.

import { notifyUser } from '@/lib/services/notification.service'
import { sendMessageAction, replyToClientNoteAction, sendBroadcastMessageAction } from '../message-actions'

beforeEach(() => vi.clearAllMocks())

describe('sendMessageAction', () => {
  it('notifies the recipient with the sender name and a preview', async () => {
    await sendMessageAction({ recipientId: 'c1', content: 'Great work on the squat progression' })

    expect(notifyUser).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('NEW_MESSAGE')
    expect(arg.userId).toBe('c1')
    expect(arg.email).toMatchObject({ senderName: 'Mike Chen' })
    expect(arg.email!.preview).toContain('squat progression')
  })

  it('does not notify for an internal trainer-only note', async () => {
    await sendMessageAction({ recipientId: 'c1', content: 'internal', isInternal: true })

    expect(notifyUser).not.toHaveBeenCalled()
  })

  it('truncates a long preview to 200 characters', async () => {
    await sendMessageAction({ recipientId: 'c1', content: 'x'.repeat(500) })

    expect((vi.mocked(notifyUser).mock.calls[0][0].email!.preview as string).length)
      .toBeLessThanOrEqual(201)
  })

  it('does not notify when the message itself failed to send', async () => {
    // arrange messageService.sendMessage to reject
    await sendMessageAction({ recipientId: 'c1', content: 'hi' })

    expect(notifyUser).not.toHaveBeenCalled()
  })
})

describe('replyToClientNoteAction', () => {
  it('notifies the client who owns the session', async () => {
    await replyToClientNoteAction('s1', 'be1', 'Add 5lb next time')

    expect(vi.mocked(notifyUser).mock.calls[0][0].userId).toBe('c1')
  })
})

describe('sendBroadcastMessageAction', () => {
  it('notifies every recipient once', async () => {
    await sendBroadcastMessageAction({ content: 'Gym closed Friday', recipientIds: ['c1', 'c2'] })

    expect(notifyUser).toHaveBeenCalledTimes(2)
    expect(vi.mocked(notifyUser).mock.calls.map((c) => c[0].userId)).toEqual(['c1', 'c2'])
  })

  it('still notifies the rest when one notify call rejects', async () => {
    vi.mocked(notifyUser).mockRejectedValueOnce(new Error('boom'))

    const res = await sendBroadcastMessageAction({ content: 'x', recipientIds: ['c1', 'c2'] })

    expect(notifyUser).toHaveBeenCalledTimes(2)
    expect(res.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- actions/__tests__/message-actions.notify.test.ts`
Expected: FAIL — `notifyUser` never called.

- [ ] **Step 3: Write `lib/email/templates/new-message.tsx`**

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface NewMessageEmailProps {
  recipientName: string;
  senderName: string;
  sentAt: string;
  preview: string;
  messagesLink: string;
  unsubscribeUrl?: string;
}

export function NewMessageEmail({
  recipientName,
  senderName,
  sentAt,
  preview,
  messagesLink,
  unsubscribeUrl,
}: NewMessageEmailProps) {
  return (
    <EmailLayout
      title="New message"
      greeting={`Hi ${recipientName},`}
      intro={`${senderName} sent you a message.`}
      details={[
        { label: "From", value: senderName },
        { label: "Sent", value: sentAt },
      ]}
      quote={preview}
      cta={{ label: "View Message", href: messagesLink }}
      reason="You received this email because message notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
```

- [ ] **Step 4: Write `lib/email/templates/exercise-note.tsx`**

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface ExerciseNoteEmailProps {
  recipientName: string;
  clientName: string;
  workoutName: string;
  summary: string;
  sessionLink: string;
  unsubscribeUrl?: string;
}

export function ExerciseNoteEmail({
  recipientName,
  clientName,
  workoutName,
  summary,
  sessionLink,
  unsubscribeUrl,
}: ExerciseNoteEmailProps) {
  return (
    <EmailLayout
      title="New exercise note"
      greeting={`Hi ${recipientName},`}
      intro={`${clientName} left a note while training.`}
      details={[
        { label: "Client", value: clientName },
        { label: "Workout", value: workoutName },
        { label: "Noted on", value: summary },
      ]}
      cta={{ label: "View Session", href: sessionLink }}
      reason="You received this email because session notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "session" } : undefined}
    />
  );
}
```

- [ ] **Step 5: Register both templates**

In `lib/notifications/registry.ts`, add the imports and replace the two `template: null, // Task 9` lines:

```ts
import { NewMessageEmail } from "@/lib/email/templates/new-message";
import { ExerciseNoteEmail } from "@/lib/email/templates/exercise-note";
```

`NEW_MESSAGE` → `template: tpl(NewMessageEmail),`
`EXERCISE_NOTE` → `template: tpl(ExerciseNoteEmail),`

- [ ] **Step 6: Wire `actions/message-actions.ts`**

Add a shared helper near the top of the file, below the imports:

```ts
const MESSAGE_PREVIEW_MAX_LENGTH = 200;

function messagePreview(content: string): string {
  return content.length > MESSAGE_PREVIEW_MAX_LENGTH
    ? `${content.slice(0, MESSAGE_PREVIEW_MAX_LENGTH)}…`
    : content;
}
```

In `sendMessageAction`, after `broadcastNewMessage(message)` and before `revalidatePath`:

```ts
    // Internal notes are trainer-only scratch — never email the client about one.
    if (!parsed.data.isInternal) {
      await notifyUser({
        userId: parsed.data.recipientId,
        type: NOTIFICATION_TYPES.NEW_MESSAGE,
        title: "New message",
        body: `${dbUser.firstName} ${dbUser.lastName} sent you a message.`,
        link: `${appBaseUrl()}/messages`,
        metadata: { messageId: message.id, senderId: dbUser.id },
        email: {
          senderName: `${dbUser.firstName} ${dbUser.lastName}`,
          sentAt: format(new Date(), "MMMM d 'at' h:mm a"),
          preview: messagePreview(parsed.data.content),
          messagesLink: `${appBaseUrl()}/messages`,
        },
      });
    }
```

In `replyToClientNoteAction`, after `broadcastNewMessage(message)`:

```ts
    await notifyUser({
      userId: log.session.clientId,
      type: NOTIFICATION_TYPES.NEW_MESSAGE,
      title: "New message",
      body: `${dbUser.firstName} ${dbUser.lastName} replied to your exercise note.`,
      link: `${appBaseUrl()}/messages`,
      metadata: { messageId: message.id, sessionId: parsed.data.sessionId },
      email: {
        senderName: `${dbUser.firstName} ${dbUser.lastName}`,
        sentAt: format(new Date(), "MMMM d 'at' h:mm a"),
        preview: messagePreview(parsed.data.content),
        messagesLink: `${appBaseUrl()}/messages`,
      },
    });
```

In `sendBroadcastMessageAction`, inside the existing `for` loop, in the `try` block right after `broadcastNewMessage(message)`:

```ts
        await notifyUser({
          userId: recipientId,
          type: NOTIFICATION_TYPES.NEW_MESSAGE,
          title: "New message",
          body: `${dbUser.firstName} ${dbUser.lastName} sent you a message.`,
          link: `${appBaseUrl()}/messages`,
          metadata: { messageId: message.id, senderId: dbUser.id, broadcast: true },
          email: {
            senderName: `${dbUser.firstName} ${dbUser.lastName}`,
            sentAt: format(new Date(), "MMMM d 'at' h:mm a"),
            preview: messagePreview(parsed.data.content),
            messagesLink: `${appBaseUrl()}/messages`,
          },
        });
```

**Deviation from spec §4.2**, which said `Promise.allSettled`: the loop already exists and already wraps each recipient in its own `try/catch`, so one failure cannot stop the rest. Reusing it is less churn and the same guarantee. Note this in the task report.

Add the imports: `notifyUser` and `NOTIFICATION_TYPES` from `@/lib/services/notification.service`, `appBaseUrl` from `@/lib/utils/app-url`, and `format` from `date-fns`.

- [ ] **Step 7: Wire `actions/voice-memo-actions.ts`**

In `confirmVoiceMemoUpload`, after the memo record is created and before the success return. The existing query already loads `workout.program.trainer` and `workout.program.client` with `id`, `email`, `firstName`, and `lastName`, so no extra lookup is needed:

```ts
    const author = authorRole === "TRAINER" ? workout.program.trainer : workout.program.client;
    const recipient = authorRole === "TRAINER" ? workout.program.client : workout.program.trainer;

    if (recipient && author) {
      const sessionLink = `${appBaseUrl()}/messages`;
      await notifyUser({
        userId: recipient.id,
        type: NOTIFICATION_TYPES.VOICE_MEMO,
        title: "New voice note",
        body: `${author.firstName} ${author.lastName} left a voice note on "${workout.name}".`,
        link: sessionLink,
        metadata: { workoutId, authorRole },
        recipientEmail: recipient.email,
        recipientName: `${recipient.firstName} ${recipient.lastName}`,
        email: {
          senderName: `${author.firstName} ${author.lastName}`,
          workoutName: workout.name,
          sessionLink,
          // The template's `role` is the RECIPIENT's role, not the author's.
          role: authorRole === "TRAINER" ? "client" : "trainer",
        },
      });
    }
```

`VoiceMemoAddedEmail` expects `recipientName`, which `notifyUser` merges in automatically — do not pass it inside `email`.

- [ ] **Step 8: Update the voice-memo test mock**

`actions/__tests__/voice-memo-actions.test.ts:33` mocks `getResend`. Replace it with:

```ts
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { VOICE_MEMO: 'VOICE_MEMO' },
}))
```

Keep the `getResend` mock only if something else in that file still needs it; otherwise delete it.

- [ ] **Step 9: Run the tests**

Run: `npm test -- actions/__tests__/message-actions.notify.test.ts actions/__tests__/voice-memo-actions.test.ts`
Expected: PASS.

Run: `npm test` and `npx tsc --noEmit` and `npm run lint`
Expected: all clean.

---

## Task 10: Check-in and feedback emails

**Files:**
- Create: `lib/email/templates/check-in-assigned.tsx`
- Create: `lib/email/templates/check-in-response.tsx`
- Create: `lib/email/templates/feedback-response.tsx`
- Modify: `lib/notifications/registry.ts` (fill in three templates)
- Modify: `actions/checkin-actions.ts:37-65, 105-140`
- Modify: `actions/feedback-actions.ts:120-126`
- Test: `actions/__tests__/checkin-actions.notify.test.ts`

**Interfaces:**
- Consumes: `EmailLayout`, `notifyUser`, `tpl`, `appBaseUrl`.
- Produces: `CheckInAssignedEmail`, `CheckInResponseEmail`, `FeedbackResponseEmail`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/checkin-actions.notify.test.ts`. Mirror the module's real imports in the mocks — it uses `requireRole` and `getCurrentUser` from `@/lib/current-user`, `checkinService`, `getClientIdsForTrainer`, and `revalidatePath`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: { CHECK_IN_DUE: 'CHECK_IN_DUE', NEW_RESPONSE: 'NEW_RESPONSE' },
}))
// plus mocks for @/lib/current-user, the checkin service, and next/cache

import { notifyUser } from '@/lib/services/notification.service'
import { assignCheckInAction, submitCheckInResponseAction } from '../checkin-actions'

beforeEach(() => vi.clearAllMocks())

describe('assignCheckInAction', () => {
  it('notifies the client with the template name and due date', async () => {
    await assignCheckInAction('tpl1', 'c1')

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('CHECK_IN_DUE')
    expect(arg.userId).toBe('c1')
    expect(arg.email).toMatchObject({ templateName: 'Weekly Check-In' })
  })

  it('does not notify when the client is not on the trainer roster', async () => {
    // arrange getClientIdsForTrainer to exclude 'c9'
    const res = await assignCheckInAction('tpl1', 'c9')

    expect(res.success).toBe(false)
    expect(notifyUser).not.toHaveBeenCalled()
  })
})

describe('submitCheckInResponseAction', () => {
  it('notifies the assigning trainer', async () => {
    await submitCheckInResponseAction('a1', { sleep: 'good' })

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('NEW_RESPONSE')
    expect(arg.userId).toBe('trainer1')
    expect(arg.email).toMatchObject({ clientName: 'Sarah Lee' })
  })

  it('does not notify when the submission failed', async () => {
    // arrange checkinService.submitCheckInResponse to reject
    await submitCheckInResponseAction('a1', { sleep: 'good' })

    expect(notifyUser).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- actions/__tests__/checkin-actions.notify.test.ts`
Expected: FAIL — `notifyUser` never called.

- [ ] **Step 3: Write the three templates**

`lib/email/templates/check-in-assigned.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface CheckInAssignedEmailProps {
  recipientName: string;
  templateName: string;
  dueDate: string;
  checkInLink: string;
  unsubscribeUrl?: string;
}

export function CheckInAssignedEmail({
  recipientName,
  templateName,
  dueDate,
  checkInLink,
  unsubscribeUrl,
}: CheckInAssignedEmailProps) {
  return (
    <EmailLayout
      title="New check-in"
      greeting={`Hi ${recipientName},`}
      intro="Your trainer has assigned you a new check-in."
      details={[
        { label: "Check-in", value: templateName },
        { label: "Due", value: dueDate },
      ]}
      cta={{ label: "Complete Check-In", href: checkInLink }}
      reason="You received this email because check-in notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
```

`lib/email/templates/check-in-response.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface CheckInResponseEmailProps {
  recipientName: string;
  clientName: string;
  templateName: string;
  submittedAt: string;
  responseLink: string;
  unsubscribeUrl?: string;
}

export function CheckInResponseEmail({
  recipientName,
  clientName,
  templateName,
  submittedAt,
  responseLink,
  unsubscribeUrl,
}: CheckInResponseEmailProps) {
  return (
    <EmailLayout
      title="Check-in submitted"
      greeting={`Hi ${recipientName},`}
      intro={`${clientName} submitted a check-in.`}
      details={[
        { label: "Client", value: clientName },
        { label: "Check-in", value: templateName },
        { label: "Submitted", value: submittedAt },
      ]}
      cta={{ label: "Review Response", href: responseLink }}
      reason="You received this email because check-in notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
```

`lib/email/templates/feedback-response.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface FeedbackResponseEmailProps {
  recipientName: string;
  trainerName: string;
  responsePreview: string;
  dashboardLink: string;
  unsubscribeUrl?: string;
}

export function FeedbackResponseEmail({
  recipientName,
  trainerName,
  responsePreview,
  dashboardLink,
  unsubscribeUrl,
}: FeedbackResponseEmailProps) {
  return (
    <EmailLayout
      title="Feedback reply"
      greeting={`Hi ${recipientName},`}
      intro={`${trainerName} replied to the feedback you left on an exercise.`}
      quote={responsePreview}
      cta={{ label: "View Reply", href: dashboardLink }}
      reason="You received this email because message notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
```

- [ ] **Step 4: Register the three templates**

In `lib/notifications/registry.ts`, add the imports and replace the `template: null, // Task 9` lines for `CHECK_IN_DUE`, `NEW_RESPONSE`, and `FEEDBACK_RESPONSE` with `tpl(CheckInAssignedEmail)`, `tpl(CheckInResponseEmail)`, and `tpl(FeedbackResponseEmail)`.

- [ ] **Step 5: Wire `actions/checkin-actions.ts`**

In `assignCheckInAction`, after `revalidatePath(...)` and before the success return. `assignTemplateToClient` returns the assignment, which carries `nextDueDate`; the template name needs the template, so select it:

```ts
    const template = await prisma.checkInTemplate.findUnique({
      where: { id: templateId },
      select: { name: true },
    });
    const checkInLink = `${appBaseUrl()}/check-ins`;

    await notifyUser({
      userId: clientId,
      type: NOTIFICATION_TYPES.CHECK_IN_DUE,
      title: "New check-in assigned",
      body: `Your trainer assigned you "${template?.name ?? "a check-in"}".`,
      link: checkInLink,
      metadata: { assignmentId: assignment.id, templateId },
      email: {
        templateName: template?.name ?? "Check-in",
        dueDate: format(new Date(assignment.nextDueDate), "EEEE, MMMM d, yyyy"),
        checkInLink,
      },
    });
```

Add `prisma` to the imports if the file does not already have it.

In `submitCheckInResponseAction`, after `revalidatePath("/check-ins")`. The response's `assignmentId` resolves to the `CheckInAssignment`, which carries `trainerId`:

```ts
    const assignment = await prisma.checkInAssignment.findUnique({
      where: { id: assignmentId },
      select: { trainerId: true, template: { select: { name: true } } },
    });

    if (assignment) {
      const responseLink = `${appBaseUrl()}/check-ins/${response.id}`;
      await notifyUser({
        userId: assignment.trainerId,
        type: NOTIFICATION_TYPES.NEW_RESPONSE,
        title: "Check-in submitted",
        body: `${user.firstName} ${user.lastName} submitted "${assignment.template.name}".`,
        link: responseLink,
        metadata: { responseId: response.id, assignmentId, clientId: user.id },
        email: {
          clientName: `${user.firstName} ${user.lastName}`,
          templateName: assignment.template.name,
          submittedAt: format(new Date(), "MMMM d 'at' h:mm a"),
          responseLink,
        },
      });
    }
```

- [ ] **Step 6: Wire `actions/feedback-actions.ts`**

In `respondToFeedbackAction`, inside the `try` after `feedbackService.respondToFeedback(...)`. `feedback.clientId` is already loaded by the authorization check above:

```ts
    const dashboardLink = `${appBaseUrl()}/dashboard`;
    await notifyUser({
      userId: feedback.clientId,
      type: NOTIFICATION_TYPES.FEEDBACK_RESPONSE,
      title: "Your trainer replied",
      body: `${dbUser.firstName} ${dbUser.lastName} replied to your exercise feedback.`,
      link: dashboardLink,
      metadata: { feedbackId: parsed.data.feedbackId },
      email: {
        trainerName: `${dbUser.firstName} ${dbUser.lastName}`,
        responsePreview: parsed.data.trainerResponse.slice(0, 200),
        dashboardLink,
      },
    });
```

- [ ] **Step 7: Verify**

Run: `npm test -- actions/__tests__/checkin-actions.notify.test.ts`
Expected: PASS, 4 tests.

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all clean.

---
## Task 11: Nutrition emails

**Files:**
- Create: `lib/email/templates/nutrition-comment.tsx`
- Create: `lib/email/templates/nutrition-nudge.tsx`
- Modify: `lib/notifications/registry.ts` (fill in five templates)
- Modify: `actions/nutrition-actions.ts:268-296`
- Modify: `app/api/cron/nutrition-nudges/route.ts:65, 116`
- Test: `actions/__tests__/nutrition-actions.test.ts` (extend; it already exists and mocks `createNotification` at line 28)

**Interfaces:**
- Consumes: `EmailLayout`, `notifyUser`, `tpl`, `appBaseUrl`.
- Produces: `NutritionCommentEmail`, `NutritionNudgeEmail`.

One template serves `NUTRITION_COMMENT` and `NUTRITION_REPLY` (an `isReply` flag switches the copy); one serves all three nudge types (the registry already supplies a per-type subject, and the site passes the existing notification `title`/`body` through as `headline`/`detail`).

- [ ] **Step 1: Write the failing test**

Extend `actions/__tests__/nutrition-actions.test.ts`. Its existing mock at line 28 is `createNotification: vi.fn()`; add `notifyUser` to that same factory and keep `createNotification` until nothing references it. Append:

```ts
describe('nutrition comments — email payload', () => {
  it('notifies the client when a trainer comments', async () => {
    // arrange the acting user as a TRAINER with access to client 'c1'
    await createNutritionCommentAction({ clientId: 'c1', date: '2026-09-22', body: 'Great protein today' })

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('NUTRITION_COMMENT')
    expect(arg.userId).toBe('c1')
    expect(arg.email).toMatchObject({ isReply: false })
    expect(arg.email!.commentPreview).toContain('Great protein')
  })

  it('notifies the trainer when a client replies, flagged as a reply', async () => {
    // arrange the acting user as the CLIENT 'c1'
    await createNutritionCommentAction({ clientId: 'c1', date: '2026-09-22', body: 'Thanks!' })

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('NUTRITION_REPLY')
    expect(arg.userId).toBe('trainer1')
    expect(arg.email).toMatchObject({ isReply: true })
  })

  it('sends nothing when the client has no trainer', async () => {
    // arrange getTrainerForClient to resolve null
    await createNutritionCommentAction({ clientId: 'c1', date: '2026-09-22', body: 'Hi' })

    expect(notifyUser).not.toHaveBeenCalled()
  })
})
```

Use the action's real exported name in place of `createNutritionCommentAction` — read `actions/nutrition-actions.ts` around line 240 for it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- actions/__tests__/nutrition-actions.test.ts`
Expected: FAIL — `notifyUser` never called.

- [ ] **Step 3: Write `lib/email/templates/nutrition-comment.tsx`**

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface NutritionCommentEmailProps {
  recipientName: string;
  authorName: string;
  commentPreview: string;
  nutritionLink: string;
  isReply: boolean;
  unsubscribeUrl?: string;
}

export function NutritionCommentEmail({
  recipientName,
  authorName,
  commentPreview,
  nutritionLink,
  isReply,
  unsubscribeUrl,
}: NutritionCommentEmailProps) {
  return (
    <EmailLayout
      title={isReply ? "Nutrition reply" : "Nutrition feedback"}
      greeting={`Hi ${recipientName},`}
      intro={
        isReply
          ? `${authorName} replied on their nutrition log.`
          : `${authorName} left feedback on your nutrition log.`
      }
      quote={commentPreview}
      cta={{ label: isReply ? "View Reply" : "View Feedback", href: nutritionLink }}
      reason="You received this email because nutrition notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "nutrition" } : undefined}
    />
  );
}
```

- [ ] **Step 4: Write `lib/email/templates/nutrition-nudge.tsx`**

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface NutritionNudgeEmailProps {
  recipientName: string;
  headline: string;
  detail: string;
  nutritionLink: string;
  unsubscribeUrl?: string;
}

export function NutritionNudgeEmail({
  recipientName,
  headline,
  detail,
  nutritionLink,
  unsubscribeUrl,
}: NutritionNudgeEmailProps) {
  return (
    <EmailLayout
      title={headline}
      greeting={`Hi ${recipientName},`}
      intro={detail}
      cta={{ label: "Open Nutrition", href: nutritionLink }}
      footnote="Nudges are sent at most once a day per goal."
      reason="You received this email because nutrition notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "nutrition" } : undefined}
    />
  );
}
```

- [ ] **Step 5: Register all five nutrition templates**

In `lib/notifications/registry.ts`, add the imports and replace the `template: null, // Task 10` lines:

- `NUTRITION_COMMENT` and `NUTRITION_REPLY` → `template: tpl(NutritionCommentEmail),`
- `NUTRITION_NUDGE_MEALS`, `NUTRITION_NUDGE_PROTEIN`, `NUTRITION_NUDGE_WATER` → `template: tpl(NutritionNudgeEmail),`

- [ ] **Step 6: Wire `actions/nutrition-actions.ts`**

Replace the trainer-branch `createNotification` (line 268) with:

```ts
      await notifyUser({
        userId: clientId,
        type: NOTIFICATION_TYPES.NUTRITION_COMMENT,
        title: "New nutrition feedback",
        body: `${user.firstName} left a comment on your nutrition log.`,
        link: "/nutrition",
        metadata: { commentId: comment.id, logId: logId ?? null },
        email: {
          authorName: `${user.firstName} ${user.lastName}`,
          commentPreview: body.slice(0, 200),
          nutritionLink: `${appBaseUrl()}/nutrition`,
          isReply: false,
        },
      });
```

And the client-branch `createNotification` (line 286) with:

```ts
        await notifyUser({
          userId: trainer.id,
          type: NOTIFICATION_TYPES.NUTRITION_REPLY,
          title: "Client replied on nutrition",
          body: `${user.firstName} ${user.lastName} replied on their nutrition log.`,
          link: `/nutrition/${clientId}`,
          metadata: { commentId: comment.id, clientId, logId: logId ?? null },
          email: {
            authorName: `${user.firstName} ${user.lastName}`,
            commentPreview: body.slice(0, 200),
            nutritionLink: `${appBaseUrl()}/nutrition/${clientId}`,
            isReply: true,
          },
        });
```

The Pusher triggers in both branches stay exactly as they are — they are the realtime path and independent of email.

- [ ] **Step 7: Wire `app/api/cron/nutrition-nudges/route.ts`**

The route builds an array of `createNotification` arguments and flushes it at line 116. Two changes:

Line 65 — retype the accumulator:

```ts
        const notifications: Parameters<typeof notifyUser>[0][] = [];
```

Line 116 — flush through `notifyUser`, deriving the email payload from the `title`/`body` each branch already sets:

```ts
        const nutritionLink = `${appBaseUrl()}/nutrition`;
        await Promise.all(
          notifications.map((n) =>
            notifyUser({
              ...n,
              email: { headline: n.title, detail: n.body ?? "", nutritionLink },
            })
          )
        );
```

Swap the `createNotification` import for `notifyUser` and add `appBaseUrl`.

The existing `alreadyNudged` set (built from unread same-type notifications) stays — it is the in-app dedup. The 1440-minute registry cooldown is a second, independent guard on the email specifically.

- [ ] **Step 8: Verify**

Run: `npm test -- actions/__tests__/nutrition-actions.test.ts`
Expected: PASS.

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all clean.

---

## Task 12: Billing emails

The three Stripe branches that currently mutate subscription state and tell nobody. All are transactional: they ignore preferences and carry no unsubscribe link.

**Files:**
- Create: `lib/email/templates/payment-failed.tsx`
- Create: `lib/email/templates/subscription-canceled.tsx`
- Create: `lib/email/templates/refund-processed.tsx`
- Modify: `lib/notifications/registry.ts` (fill in three templates)
- Modify: `app/api/stripe/webhook/route.ts:74-113`
- Test: `app/api/stripe/__tests__/webhook.notify.test.ts`

**Interfaces:**
- Consumes: `EmailLayout`, `notifyUser`, `sendEmail`, `tpl`, `appBaseUrl`.
- Produces: `PaymentFailedEmail`, `SubscriptionCanceledEmail`, `RefundProcessedEmail`.

**Recipient lookups the current code does not do.** `TrainerSubscription` has `trainerId` → `User`, so payment-failure and cancellation resolve by updating and selecting the trainer in one call. Refunds are different: `ProgramPurchase.buyerUserId` is **optional** (a purchase can be refunded before the account is claimed), so when it is null there is no user to notify in-app — fall back to a plain `sendEmail` to `buyerEmail`.

- [ ] **Step 1: Write the failing test**

Create `app/api/stripe/__tests__/webhook.notify.test.ts`. Mock `@/lib/stripe` so `constructEvent` returns a fixture event rather than verifying a signature.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const constructEvent = vi.fn()
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent },
    checkout: { sessions: { list: vi.fn(async () => ({ data: [{ id: 'cs_1' }] })) } },
  },
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainerSubscription: { update: vi.fn() },
    programPurchase: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    program: { updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/services/notification.service', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
  NOTIFICATION_TYPES: {
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    SUBSCRIPTION_CANCELED: 'SUBSCRIPTION_CANCELED',
    REFUND_PROCESSED: 'REFUND_PROCESSED',
  },
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/services/stripe-billing.service', () => ({
  syncSubscriptionFromStripe: vi.fn(),
  activateSubscriptionFromCheckout: vi.fn(),
}))
vi.mock('@/lib/services/program-purchase.service', () => ({ fulfillProgramPurchase: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/services/notification.service'
import { sendEmail } from '@/lib/email/send'
import { POST } from '../webhook/route'

const post = () => POST(new Request('https://app.test/api/stripe/webhook', {
  method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' },
}))

const TRAINER = { trainerId: 't1', trainer: { email: 't@example.com', firstName: 'Mike', lastName: 'Chen' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(prisma.trainerSubscription.update).mockResolvedValue(TRAINER as never)
})

describe('invoice.payment_failed', () => {
  it('notifies the trainer with the amount due', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', amount_due: 4900, currency: 'usd' } },
    })

    await post()

    const arg = vi.mocked(notifyUser).mock.calls[0][0]
    expect(arg.type).toBe('PAYMENT_FAILED')
    expect(arg.userId).toBe('t1')
    expect(arg.email).toMatchObject({ amountDue: '$49.00' })
  })

  it('still returns 200 when the notify step fails', async () => {
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', amount_due: 4900, currency: 'usd' } },
    })
    vi.mocked(notifyUser).mockRejectedValue(new Error('boom'))

    expect((await post()).status).toBe(200)
  })
})

describe('customer.subscription.deleted', () => {
  it('notifies the trainer', async () => {
    constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    })

    await post()

    expect(vi.mocked(notifyUser).mock.calls[0][0].type).toBe('SUBSCRIPTION_CANCELED')
  })
})

describe('charge.refunded', () => {
  it('notifies the buyer in-app when the account exists', async () => {
    constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount_refunded: 7999, currency: 'usd' } },
    })
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({
      id: 'pp1', buyerUserId: 'u9', buyerEmail: 'buyer@example.com',
      assignedProgramIds: ['prog1'],
    } as never)

    await post()

    expect(vi.mocked(notifyUser).mock.calls[0][0].userId).toBe('u9')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('emails buyerEmail directly when the account was never claimed', async () => {
    constructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1', amount_refunded: 7999, currency: 'usd' } },
    })
    vi.mocked(prisma.programPurchase.findUnique).mockResolvedValue({
      id: 'pp1', buyerUserId: null, buyerEmail: 'buyer@example.com',
      assignedProgramIds: ['prog1'],
    } as never)

    await post()

    expect(notifyUser).not.toHaveBeenCalled()
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe('buyer@example.com')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/api/stripe/__tests__/webhook.notify.test.ts`
Expected: FAIL — `notifyUser` never called.

- [ ] **Step 3: Write the three templates**

None takes an `unsubscribeUrl` — transactional mail carries no link.

`lib/email/templates/payment-failed.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface PaymentFailedEmailProps {
  recipientName: string;
  amountDue: string;
  billingLink: string;
}

export function PaymentFailedEmail({
  recipientName,
  amountDue,
  billingLink,
}: PaymentFailedEmailProps) {
  return (
    <EmailLayout
      title="Payment failed"
      greeting={`Hi ${recipientName},`}
      intro="We could not process your latest payment, so your subscription is now past due. Updating your payment method will restore full access."
      details={[{ label: "Amount", value: amountDue }]}
      cta={{ label: "Update Payment Method", href: billingLink }}
      footnote="If you have already updated your card, you can ignore this email — the next retry will go through."
      reason="This is a billing notification and is always sent."
    />
  );
}
```

`lib/email/templates/subscription-canceled.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface SubscriptionCanceledEmailProps {
  recipientName: string;
  billingLink: string;
}

export function SubscriptionCanceledEmail({
  recipientName,
  billingLink,
}: SubscriptionCanceledEmailProps) {
  return (
    <EmailLayout
      title="Subscription canceled"
      greeting={`Hi ${recipientName},`}
      intro="Your subscription has been canceled. Your client data and programs are kept, and resubscribing restores access to them at any time."
      cta={{ label: "View Billing", href: billingLink }}
      reason="This is a billing notification and is always sent."
    />
  );
}
```

`lib/email/templates/refund-processed.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";

interface RefundProcessedEmailProps {
  recipientName: string;
  amount: string;
  programCount: number;
}

export function RefundProcessedEmail({
  recipientName,
  amount,
  programCount,
}: RefundProcessedEmailProps) {
  return (
    <EmailLayout
      title="Refund processed"
      greeting={`Hi ${recipientName},`}
      intro="Your refund has been processed and should appear on your statement within 5–10 business days."
      details={[
        { label: "Amount", value: amount },
        {
          label: "Programs",
          value: `${programCount} program${programCount === 1 ? "" : "s"} paused`,
        },
      ]}
      footnote="If you believe this refund was issued in error, reply to this email and we will look into it."
      reason="This is a billing notification and is always sent."
    />
  );
}
```

- [ ] **Step 4: Register the three templates**

In `lib/notifications/registry.ts`, add the imports and replace the `template: null, // Task 11` lines with `tpl(PaymentFailedEmail)`, `tpl(SubscriptionCanceledEmail)`, and `tpl(RefundProcessedEmail)`.

- [ ] **Step 5: Add a currency formatter**

Stripe amounts are integer minor units. Add to `lib/utils/app-url.ts`'s sibling — create `lib/utils/money.ts`:

```ts
/** Formats a Stripe minor-unit amount, e.g. (4900, "usd") -> "$49.00". */
export function formatStripeAmount(amountInMinorUnits: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountInMinorUnits / 100);
}
```

- [ ] **Step 6: Wire the three webhook branches**

All three go inside `after()` so Stripe still gets a fast acknowledgement, and each is wrapped so a notify failure cannot turn a handled event into a 500 and a Stripe retry.

`customer.subscription.deleted` — `update` already runs; add `select` so it returns the trainer:

```ts
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const updated = await prisma.trainerSubscription.update({
          where: { stripeCustomerId: sub.customer as string },
          data: { status: "CANCELED" },
          select: {
            trainerId: true,
            trainer: { select: { email: true, firstName: true, lastName: true } },
          },
        });
        after(async () => {
          try {
            await notifyUser({
              userId: updated.trainerId,
              type: NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED,
              title: "Subscription canceled",
              body: "Your subscription has been canceled.",
              link: `${appBaseUrl()}/settings/billing`,
              recipientEmail: updated.trainer.email,
              recipientName: `${updated.trainer.firstName} ${updated.trainer.lastName}`,
              email: { billingLink: `${appBaseUrl()}/settings/billing` },
            });
          } catch (err) {
            console.error("subscription-canceled notify failed:", err);
          }
        });
        break;
      }
```

`invoice.payment_failed` — the same shape, adding the amount:

```ts
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const updated = await prisma.trainerSubscription.update({
          where: { stripeCustomerId: invoice.customer as string },
          data: { status: "PAST_DUE" },
          select: {
            trainerId: true,
            trainer: { select: { email: true, firstName: true, lastName: true } },
          },
        });
        const amountDue = formatStripeAmount(invoice.amount_due ?? 0, invoice.currency ?? "usd");
        after(async () => {
          try {
            await notifyUser({
              userId: updated.trainerId,
              type: NOTIFICATION_TYPES.PAYMENT_FAILED,
              title: "Payment failed",
              body: `We could not process your payment of ${amountDue}. Your subscription is past due.`,
              link: `${appBaseUrl()}/settings/billing`,
              recipientEmail: updated.trainer.email,
              recipientName: `${updated.trainer.firstName} ${updated.trainer.lastName}`,
              email: { amountDue, billingLink: `${appBaseUrl()}/settings/billing` },
            });
          } catch (err) {
            console.error("payment-failed notify failed:", err);
          }
        });
        break;
      }
```

`charge.refunded` — inside the existing `if (purchase && purchase.assignedProgramIds.length > 0)` block, after the two updates. `buyerUserId` may be null:

```ts
              const amount = formatStripeAmount(
                charge.amount_refunded ?? 0,
                charge.currency ?? "usd"
              );
              const programCount = purchase.assignedProgramIds.length;
              const buyerUserId = purchase.buyerUserId;
              const buyerEmail = purchase.buyerEmail;

              after(async () => {
                try {
                  if (buyerUserId) {
                    await notifyUser({
                      userId: buyerUserId,
                      type: NOTIFICATION_TYPES.REFUND_PROCESSED,
                      title: "Refund processed",
                      body: `Your refund of ${amount} has been processed.`,
                      link: `${appBaseUrl()}/programs`,
                      email: { amount, programCount },
                    });
                  } else {
                    // The buyer never claimed their account, so there is no
                    // in-app recipient — email the purchase address directly.
                    await sendEmail({
                      to: buyerEmail,
                      subject: "Your refund has been processed",
                      react: React.createElement(RefundProcessedEmail, {
                        recipientName: "there",
                        amount,
                        programCount,
                      }),
                    });
                  }
                } catch (err) {
                  console.error("refund notify failed:", err);
                }
              });
```

Add the imports: `React`, `notifyUser` and `NOTIFICATION_TYPES` from `@/lib/services/notification.service`, `sendEmail` from `@/lib/email/send`, `RefundProcessedEmail`, `appBaseUrl`, and `formatStripeAmount`. `after` is already imported from `next/server` at line 1.

- [ ] **Step 7: Verify**

Run: `npm test -- app/api/stripe/__tests__/webhook.notify.test.ts`
Expected: PASS, 6 tests.

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`
Expected: all clean.

---

## Task 13: Cron registration and environment

The last gap: the session reminder email has never run in production because `/api/reminders` is not a registered cron.

**Files:**
- Modify: `vercel.json`
- Create: `docs/email-notifications-setup.md`

**Interfaces:**
- Consumes: everything. This task ships the system.
- Produces: nothing in code.

- [ ] **Step 1: Register the reminders cron**

`vercel.json` currently lists three crons. Add a fourth:

```json
{
  "crons": [
    { "path": "/api/cron/mark-missed-sessions", "schedule": "0 * * * *" },
    { "path": "/api/cron/retry-program-purchases", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/nutrition-nudges", "schedule": "0 22 * * *" },
    { "path": "/api/reminders", "schedule": "0 9 * * *" }
  ]
}
```

`0 9 * * *` is 09:00 UTC daily. The route already looks 24 hours ahead and dedupes per session via `metadata.sessionId`, so one run a day is correct and a double-run is harmless.

`app/api/reminders/route.ts` already enforces `CRON_SECRET` when the variable is set, and skips the check when it is not — so registering the cron is safe whether or not the secret is configured yet.

- [ ] **Step 2: Verify the cron config parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')).crons.forEach(c=>console.log(c.path, c.schedule))"`
Expected: four lines, including `/api/reminders 0 9 * * *`.

- [ ] **Step 3: Write the setup document**

Create `docs/email-notifications-setup.md`:

```markdown
# Email notifications — setup

## Required environment variables

| Variable | Where | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Preview, Production | Resend API key. Without it every send is logged and skipped; nothing else breaks. |
| `RESEND_FROM_EMAIL` | Preview, Production | Verified sender, e.g. `noreply@inmotusrx.com`. Defaults to that value. |
| `NEXT_PUBLIC_APP_URL` | all | Base URL for links in emails. Already set. |
| `CRON_SECRET` | Production | Enforced by `/api/reminders` when present. |

## Resend account

1. The sending domain (`inmotusrx.com`) must be verified in Resend with SPF and DKIM records.
2. Until it is, mail either fails or lands in spam.
3. Prefer provisioning Resend through the Vercel Marketplace integration (`vercel integration add resend`), which manages `RESEND_API_KEY` across environments, over pasting the key by hand.

## Behavior without a key

`sendEmail` catches everything and returns `false`. In-app notifications, server actions, and cron routes all work normally. This is why Tasks 1–12 can be developed and tested with no Resend account.

## Adding a new notification type

1. Add the constant to `NOTIFICATION_TYPES` in `lib/notifications/types.ts`.
2. Add an entry to `NOTIFICATION_REGISTRY` in `lib/notifications/registry.ts` — `template: null` is valid and means in-app only.
3. Call `notifyUser` at the site. Nothing else.

The registry completeness test in `lib/notifications/__tests__/registry.test.ts` fails if step 2 is skipped.

## Manual QA before enabling production sends

Vitest runs in the `node` environment, so no test renders an email. Send one of each template through Resend's dashboard or a preview deployment and check: the header bar, the detail rows, the CTA link, and that the footer unsubscribe link appears on non-billing mail and is absent on billing mail.
```

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: every suite passes.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: a successful production build. This is the first task that exercises the new page and route through the Next.js compiler.

Run: `grep -rn "getResend" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=.next . | grep -v "lib/email/resend.ts" | grep -v "lib/email/send.ts" | grep -v "__tests__"`
Expected: no output.

Run: `grep -c "template: null" lib/notifications/registry.ts`
Expected: `0` — every type now has a template.

---
