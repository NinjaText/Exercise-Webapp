# Mobile Store Rules Implementation Plan (Plan 4 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app pass App Store and Play review rules and behave like a native app: no purchases or pricing reachable inside the shell, email-only sign-in on native, native file saving and sharing, haptics, universal/app links, and a remote minimum-version gate.

**Architecture:** Server components and route handlers branch on `getNativeInfo()` (user-agent marker); client components use `useNative()`. Navigation filtering stays in the pure `nav-items.ts`. Native-only behaviours live in small dependency-injected modules under `lib/native/` with unit tests; the native projects gain entitlements, URL schemes and intent filters that `mobile/scripts/verify.cjs` checks.

**Tech Stack:** Next.js 16.1 App Router, React 19.2, Clerk 7, Vitest 4 (node env, `renderToStaticMarkup`), Capacitor 8 plugins `filesystem` 8.1.3, `share` 8.0.2, `haptics` 8.0.2 (new) plus `app`/`browser` already installed.

**Spec:** `docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md` — §5 (links and downloads, haptics), §6 (email-only sign-in on native), §7 (billing gate), §9 (deep links, version gate), §10 (compliance). Roadmap: `docs/superpowers/plans/2026-09-21-mobile-app-roadmap.md`. Carries one residual from Plan 2 (`docs/superpowers/plans/2026-09-26-mobile-native-shell.md`, execution record item 6).

## Global Constraints

- Native detection: server code uses `getNativeInfo()` from `lib/native/server.ts`; client code uses `useNative()` from `hooks/use-native.ts`. Native plugin calls only when `Capacitor.isNativePlatform()` is true.
- **No purchase path inside the shell (Apple 3.1.1):** on native, no prices, no checkout buttons, no links or instructions pointing to a payment page. Neutral copy only: "managed from your account on the web". No URL, no button to the web.
- `/api/checkout/program` returns **403** for requests carrying the native user-agent marker.
- Signed-out native users never see the marketing landing page: `/` redirects to `/sign-in` (signed in: `/dashboard`) when the user agent is native, decided in `proxy.ts` so the landing page stays statically rendered.
- **Email-only sign-in on native (Apple 4.8):** social sign-in buttons and the "or" divider are hidden via Clerk `appearance` style objects `{ display: "none" }` on `socialButtonsBlockButton`, `socialButtonsIconButton`, `dividerRow`.
- App host `app.goinmotus.com`; custom scheme `inmotus`; deep-link path prefixes live in `lib/native/deep-link-paths.json` (single source for the web route, the Android manifest check and tests).
- iOS Associated Domains entitlement is referenced **only by the Release build configuration**, because free Personal Teams cannot sign that capability and the owner runs Debug builds on their own phone with a free Apple ID.
- New server env vars, all optional: `APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated), `MOBILE_MIN_VERSION_IOS`, `MOBILE_MIN_VERSION_ANDROID` (default `1.0.0`), `NEXT_PUBLIC_IOS_STORE_URL`, `NEXT_PUBLIC_ANDROID_STORE_URL`. Missing values must never break the web app: well-known routes return 404; the version gate never blocks.
- New Capacitor plugins are pinned to exact versions in **both** root `package.json` and `mobile/package.json`, then `cd mobile && npm run sync && npm run verify`.
- Colours only via semantic tokens; raw Tailwind palette classes fail the error-level `design/no-raw-palette` rule.
- Tests: Vitest 4, node env, `@` = repo root, `renderToStaticMarkup`, no jsdom. Mobile scripts: `cd mobile && npm test` (glob form).
- **Each task ends with one commit** of exactly its files, Conventional Commit subject, `Co-Authored-By:` trailer naming the model that wrote it. Nothing pushed; never `git push`, `rebase`, `reset --hard`, or switch branches.

## Review Focus

1. **A trainer whose trial expired opens the app.** They must see a neutral attention screen with Sign out — never prices, a Stripe page, or a link to one. → Task 1 renders the billing page under native and asserts no `$`, no `stripe`, no `http`, and a Sign out control.
2. **Deep links as an open-redirect vector.** A crafted `inmotus://` or universal link must never navigate the web view to another origin (e.g. `inmotus:////evil.com`, `https://app.goinmotus.com//evil.com`). → Task 5 tests `pathFromAppUrl` against these.
3. **A shared file with a hostile or odd name.** Program names with slashes, emoji, or 300 characters must still save and share. → Task 4 tests `safeFilename`.
4. **The user cancels the share sheet.** That must not surface an error toast. → Task 4 tests that a share rejection with a cancel message is swallowed and others propagate.
5. **Bad or missing version config.** A malformed `MOBILE_MIN_VERSION_*` or an unreachable config endpoint must never lock users out. → Task 6 tests `isVersionBelow` with malformed input and `checkForRequiredUpdate` with a failing fetch.

---

## File Structure

| File | Responsibility |
|---|---|
| `components/layout/nav-items.ts` (modify) | `NavOptions { native }`; hide `/settings/billing` on native in `getAccountNav` / `getMoreItems`. |
| `components/layout/sidebar.tsx`, `header.tsx`, `mobile-tab-bar.tsx`, `app/(platform)/layout.tsx` (modify) | Thread `isNative` so Billing disappears in the shell. |
| `components/billing/subscription-attention-screen.tsx` (create) | Neutral no-purchase screen. |
| `app/billing/page.tsx`, `app/billing/cancel/page.tsx` (modify); `app/billing/success/page.tsx` → server wrapper + `billing-success-client.tsx` | Native branch. |
| `app/(platform)/settings/billing/page.tsx` (modify) | Native branch. |
| `lib/native/landing.ts` (create), `proxy.ts` (modify) | Native `/` redirect. |
| `app/p/[slug]/page.tsx` (modify), `components/billing/native-purchase-notice.tsx` (create) | No price / buy on native. |
| `app/api/checkout/program/route.ts` (modify) | 403 on native. |
| `lib/native/auth-appearance.ts`, `components/auth/native-aware-auth.tsx` (create); sign-in/up pages (modify) | Email-only on native. |
| `lib/native/download.ts`, `lib/native/haptics.ts` (create) | File bridge, haptics. |
| `components/programs/program-detail-view.tsx`, `program-list-client.tsx`, `components/workout/workout-session-tracker.tsx`, `workout-checklist-tracker.tsx`, `app/(platform)/check-ins/[id]/respond/respond-form.tsx` (modify) | Call sites. |
| `lib/native/deep-link-paths.json`, `lib/native/deep-links.ts` (create) | Deep-link source of truth and pure helpers. |
| `app/.well-known/apple-app-site-association/route.ts`, `app/.well-known/assetlinks.json/route.ts` (create) | Association files. |
| `lib/native/lifecycle.ts`, `components/providers/native-provider.tsx` (modify) | `appUrlOpen`, launch URL, same-origin new-tab links, `refreshOwed` fix, resume hook, version gate. |
| `mobile/ios/App/App/App.entitlements` (create); `project.pbxproj`, `Info.plist`, `AndroidManifest.xml` (modify) | Native link wiring. |
| `mobile/scripts/verify.cjs` + test (modify) | Deep-link checks. |
| `lib/native/version.ts`, `app/api/mobile/config/route.ts`, `components/layout/update-required-screen.tsx` (create) | Version gate. |
| `mobile/README.md` (modify) | Env vars and link setup. |

---

### Task 1: Billing gate inside the shell

**Files:**
- Modify: `components/layout/nav-items.ts`, `components/layout/sidebar.tsx`, `components/layout/header.tsx`, `components/layout/mobile-tab-bar.tsx`, `app/(platform)/layout.tsx`, `app/billing/page.tsx`, `app/billing/cancel/page.tsx`, `app/(platform)/settings/billing/page.tsx`
- Move: `app/billing/success/page.tsx` → `app/billing/success/billing-success-client.tsx`; create a new server `app/billing/success/page.tsx`
- Create: `components/billing/subscription-attention-screen.tsx`
- Test: `components/layout/__tests__/nav-items.test.ts` (extend), `components/billing/__tests__/subscription-attention-screen.test.tsx`, `app/billing/__tests__/billing-page.native.test.tsx`

**Interfaces:**
- Consumes: `getNativeInfo(): Promise<NativeInfo>`; existing `getAccountNav(role)`, `getMoreItems(role, isAdmin)`.
- Produces:
  ```ts
  export interface NavOptions { native?: boolean }
  export function getAccountNav(role: Role, options?: NavOptions): NavItem[];
  export function getMoreItems(role: Role, isAdmin: boolean, options?: NavOptions): NavItem[];
  export type AttentionReason = "trial_expired" | "payment_failed" | "manage";
  export function SubscriptionAttentionScreen(props: { reason: AttentionReason; layout?: "page" | "inline" }): JSX.Element;
  ```
  `Sidebar`, `Header`, `MobileTabBar` gain an optional `isNative?: boolean` prop (default `false`).

- [ ] **Step 1: Failing tests for native nav filtering**

Append to `components/layout/__tests__/nav-items.test.ts`:

```ts
describe("native navigation filtering", () => {
  it("hides Billing from the trainer's account nav in the native shell only", () => {
    expect(getAccountNav("TRAINER").some((i) => i.href === "/settings/billing")).toBe(true);
    expect(getAccountNav("TRAINER", { native: true }).some((i) => i.href === "/settings/billing")).toBe(false);
  });
  it("keeps every other account entry on native", () => {
    const web = getAccountNav("TRAINER").map((i) => i.href).filter((h) => h !== "/settings/billing");
    expect(getAccountNav("TRAINER", { native: true }).map((i) => i.href)).toEqual(web);
  });
  it("hides Billing from the phone More sheet on native", () => {
    expect(getMoreItems("TRAINER", true, { native: true }).some((i) => i.href === "/settings/billing")).toBe(false);
    expect(getMoreItems("TRAINER", true).some((i) => i.href === "/settings/billing")).toBe(true);
  });
});
```

Run: `npx vitest run components/layout/__tests__/nav-items.test.ts` → FAIL (options ignored).

- [ ] **Step 2: Implement the filter**

In `components/layout/nav-items.ts`:

```ts
export interface NavOptions {
  /** True inside the Capacitor shell, where purchase surfaces must not appear (Apple 3.1.1). */
  native?: boolean;
}

/** Destinations that sell or manage payment; never shown in the native shell. */
const NATIVE_HIDDEN_HREFS = new Set(["/settings/billing"]);

export function getAccountNav(role: Role, options: NavOptions = {}): NavItem[] {
  const items = role === "TRAINER" ? TRAINER_ACCOUNT_NAV : CLIENT_ACCOUNT_NAV;
  return options.native ? items.filter((i) => !NATIVE_HIDDEN_HREFS.has(i.href)) : items;
}
```

Change `getMoreItems(role, isAdmin)` to `getMoreItems(role: Role, isAdmin: boolean, options: NavOptions = {})` and have it call `getAccountNav(role, options)`. Keep its doc comment accurate.

Run the nav tests → PASS. Run `npx vitest run components/layout` → all pass (the sidebar parity test uses web defaults and must stay green).

- [ ] **Step 3: Thread `isNative` through the chrome**

- `Sidebar`: add `isNative?: boolean` to `SidebarProps` (default `false`). Compute `allHrefs` with `getAccountNav(role, { native: isNative })`. Render the Billing item only when `role === "TRAINER" && !isNative`.
- `Header`: add `isNative?: boolean`; pass it to the `<Sidebar mobileMode … />` in its sheet.
- `MobileTabBar`: add `isNative?: boolean`; call `getMoreItems(role, isAdmin, { native: isNative })`.
- `app/(platform)/layout.tsx`: `import { getNativeInfo } from "@/lib/native/server";`, add `const native = await getNativeInfo();` next to the other awaits, and pass `isNative={native.isNative}` to `Sidebar`, `Header` and `MobileTabBar`.

Add to `components/layout/__tests__/mobile-tab-bar.test.tsx` (it already mocks `next/navigation`): render `<MobileTabBar role="TRAINER" unreadMessageCount={0} isNative />` and assert the markup does not contain `href="/settings/billing"` (the More sheet is closed, so also assert via `getMoreItems` in Step 1; this test guards the prop wiring by checking the component compiles and renders). Add to `components/layout/__tests__/sidebar-nav-parity.test.tsx` a case rendering the trainer sidebar at `/settings` with `isNative` and asserting `href="/settings/billing"` is absent while `href="/settings/notifications"` is present.

- [ ] **Step 4: The attention screen and its test**

```tsx
// components/billing/__tests__/subscription-attention-screen.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({ SignOutButton: ({ children }: { children: React.ReactNode }) => children }));

import { SubscriptionAttentionScreen } from "../subscription-attention-screen";

describe("SubscriptionAttentionScreen", () => {
  for (const reason of ["trial_expired", "payment_failed", "manage"] as const) {
    it(`${reason}: neutral copy, no price, no payment link, offers sign out`, () => {
      const html = renderToStaticMarkup(<SubscriptionAttentionScreen reason={reason} />);
      expect(html).toContain("managed from your account on the web");
      expect(html).not.toMatch(/\$\d/);
      expect(html.toLowerCase()).not.toContain("stripe");
      expect(html).not.toContain("http");
      expect(html).not.toMatch(/<a\b/);
      expect(html).toContain("Sign out");
    });
  }
});
```

```tsx
// components/billing/subscription-attention-screen.tsx
import { SignOutButton } from "@clerk/nextjs";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AttentionReason = "trial_expired" | "payment_failed" | "manage";

const HEADLINE: Record<AttentionReason, string> = {
  trial_expired: "Your subscription needs attention",
  payment_failed: "Your subscription needs attention",
  manage: "Subscription",
};

const REASON_TEXT: Record<AttentionReason, string> = {
  trial_expired: "Your free trial has ended.",
  payment_failed: "There's a problem with your last subscription payment.",
  manage: "",
};

/**
 * Shown inside the native shell instead of any pricing or checkout UI.
 * Apple 3.1.1: no prices, no purchase buttons, and no links or directions to
 * a payment page — only a neutral statement and a way to sign out.
 */
export function SubscriptionAttentionScreen({
  reason,
  layout = "page",
}: {
  reason: AttentionReason;
  layout?: "page" | "inline";
}) {
  const body = (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <CreditCard className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{HEADLINE[reason]}</h1>
      <p className="text-sm text-muted-foreground">
        {REASON_TEXT[reason] ? `${REASON_TEXT[reason]} ` : ""}
        Your subscription is managed from your account on the web.
      </p>
      <SignOutButton>
        <Button variant="outline">Sign out</Button>
      </SignOutButton>
    </div>
  );
  if (layout === "inline") return body;
  return <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">{body}</div>;
}
```

Run: `npx vitest run components/billing` → PASS, 3 tests.

- [ ] **Step 5: Branch the billing pages**

- `app/billing/page.tsx`: after the role check and after reading `reason`, add:
  ```tsx
  const native = await getNativeInfo();
  if (native.isNative) {
    const r = reason === "trial_expired" || reason === "payment_failed" ? reason : "manage";
    return <SubscriptionAttentionScreen reason={r} />;
  }
  ```
- `app/billing/cancel/page.tsx`: make it `async`; first line `if ((await getNativeInfo()).isNative) redirect("/dashboard");`.
- `app/billing/success/page.tsx`: `git mv` it to `app/billing/success/billing-success-client.tsx`, rename the default export to `export function BillingSuccessClient()`, and create a new server `page.tsx`:
  ```tsx
  import { redirect } from "next/navigation";
  import { getNativeInfo } from "@/lib/native/server";
  import { BillingSuccessClient } from "./billing-success-client";

  export default async function BillingSuccessPage() {
    if ((await getNativeInfo()).isNative) redirect("/dashboard");
    return <BillingSuccessClient />;
  }
  ```
- `app/(platform)/settings/billing/page.tsx`: after `requireRole("TRAINER")`, add a native branch that returns the page shell with header "Billing & Subscription" and `<SubscriptionAttentionScreen reason="manage" layout="inline" />` instead of any status or pricing cards.

- [ ] **Step 6: Test the billing page under native**

```tsx
// app/billing/__tests__/billing-page.native.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "clerk_1" })) }));
vi.mock("@clerk/nextjs", () => ({ SignOutButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "u1", role: "TRAINER" })) },
    trainerSubscription: { findUnique: vi.fn(async () => ({ status: "CANCELED", trialEndsAt: new Date(0) })) },
  },
}));
vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn() }));
vi.mock("@/components/billing/pricing-cards", () => ({ PricingCards: () => "PRICING_CARDS" }));

import { getNativeInfo } from "@/lib/native/server";
import BillingPage from "../page";

describe("billing page", () => {
  it("renders the neutral attention screen, not pricing, inside the native shell", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "ios", appVersion: "1.0.0" });
    const html = renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve({ reason: "trial_expired" }) }));
    expect(html).toContain("Your free trial has ended.");
    expect(html).not.toContain("PRICING_CARDS");
    expect(html).not.toMatch(/\$\d/);
  });

  it("still renders pricing on the web", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
    const html = renderToStaticMarkup(await BillingPage({ searchParams: Promise.resolve({ reason: "trial_expired" }) }));
    expect(html).toContain("PRICING_CARDS");
  });
});
```

Run: `npx vitest run app/billing components/billing components/layout` → PASS. If the page imports something else that needs a mock to render in node (read the page's imports first), add a minimal mock and say which in the report.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint components/layout components/billing app/billing "app/(platform)/layout.tsx" "app/(platform)/settings/billing/page.tsx"` → clean (delete `.next/types` first if tsc reports stale missing pages).

Confirm with a native user agent against `npm run dev`: `curl -s -A "Mozilla/5.0 InmotusApp/1.0.0 (ios)" -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/billing/cancel` — signed out this redirects to sign-in (auth runs first), which is acceptable; the important check is that the build succeeds and tests pass. Stop the dev server.

```bash
git add components/layout components/billing app/billing "app/(platform)/layout.tsx" "app/(platform)/settings/billing/page.tsx"
git commit -m "feat: replace billing and pricing with a neutral screen inside the native app"
```

---

### Task 2: Remove other purchase surfaces from the shell

**Files:**
- Create: `lib/native/landing.ts`, `lib/native/__tests__/landing.test.ts`, `components/billing/native-purchase-notice.tsx`, `components/billing/__tests__/native-purchase-notice.test.tsx`, `app/api/checkout/program/__tests__/route.native.test.ts`
- Modify: `proxy.ts`, `app/p/[slug]/page.tsx`, `app/api/checkout/program/route.ts`

**Interfaces:**
- Consumes: `parseNativeUserAgent(ua)` (`lib/native/platform.ts`), `getNativeInfo()`.
- Produces: `nativeLandingRedirect(pathname: string, userAgent: string | null, signedIn: boolean): string | null`; `NativePurchaseNotice(): JSX.Element`.

- [ ] **Step 1: Failing test for the landing redirect**

```ts
// lib/native/__tests__/landing.test.ts
import { describe, it, expect } from "vitest";
import { nativeLandingRedirect } from "../landing";

const IOS = "Mozilla/5.0 (iPhone) InmotusApp/1.0.0 (ios)";
const WEB = "Mozilla/5.0 (Macintosh) Safari/605.1.15";

describe("nativeLandingRedirect", () => {
  it("sends a signed-out native user from / to sign-in", () => {
    expect(nativeLandingRedirect("/", IOS, false)).toBe("/sign-in");
  });
  it("sends a signed-in native user from / to the dashboard", () => {
    expect(nativeLandingRedirect("/", IOS, true)).toBe("/dashboard");
  });
  it("leaves web visitors on the landing page", () => {
    expect(nativeLandingRedirect("/", WEB, false)).toBeNull();
    expect(nativeLandingRedirect("/", null, false)).toBeNull();
  });
  it("only applies to the root path", () => {
    expect(nativeLandingRedirect("/about", IOS, false)).toBeNull();
    expect(nativeLandingRedirect("/sign-in", IOS, false)).toBeNull();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement and wire it into `proxy.ts`**

```ts
// lib/native/landing.ts
import { parseNativeUserAgent } from "./platform";

/**
 * The marketing landing page lists plan prices, which must not appear inside
 * the native shell (Apple 3.1.1). Decided in proxy.ts so "/" stays static.
 */
export function nativeLandingRedirect(pathname: string, userAgent: string | null, signedIn: boolean): string | null {
  if (pathname !== "/") return null;
  if (!parseNativeUserAgent(userAgent).isNative) return null;
  return signedIn ? "/dashboard" : "/sign-in";
}
```

In `proxy.ts`, import `NextResponse` from `next/server` and `nativeLandingRedirect` from `@/lib/native/landing`. At the top of the `clerkMiddleware` callback, before the public-route check:

```ts
  const nativeTarget = nativeLandingRedirect(
    req.nextUrl.pathname,
    req.headers.get("user-agent"),
    Boolean((await auth()).userId)
  );
  if (nativeTarget) return NextResponse.redirect(new URL(nativeTarget, req.url));
```

Only call `auth()` for that when the path is `/` and the UA is native — reorder so `nativeLandingRedirect(pathname, ua, false)` is checked first and `auth()` is awaited only if it returned non-null, to avoid an extra auth call on every request. Run the landing tests → PASS.

- [ ] **Step 3: Purchase page and notice**

```tsx
// components/billing/__tests__/native-purchase-notice.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NativePurchaseNotice } from "../native-purchase-notice";

describe("NativePurchaseNotice", () => {
  it("states availability neutrally with no price, button or link", () => {
    const html = renderToStaticMarkup(<NativePurchaseNotice />);
    expect(html).toContain("available on our website");
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toMatch(/<a\b|<button\b/);
  });
});
```

```tsx
// components/billing/native-purchase-notice.tsx
/** Replaces price and Buy on /p/[slug] inside the native shell (Apple 3.1.1). */
export function NativePurchaseNotice() {
  return (
    <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground">
      This program is available on our website.
    </p>
  );
}
```

In `app/p/[slug]/page.tsx`: `const native = await getNativeInfo();`. When native, render the program name and description but replace the whole price card (price title, "One-time payment", bundle and `BuyButton`) with `<NativePurchaseNotice />`. Web rendering is unchanged.

- [ ] **Step 4: Checkout guard and its test**

At the top of `POST` in `app/api/checkout/program/route.ts`:

```ts
  // Defence in depth: the app never shows a Buy button, but a crafted request
  // from the shell must not be able to start a checkout either (Apple 3.1.1).
  if ((await getNativeInfo()).isNative) {
    return new NextResponse("Purchases are not available in the app", { status: 403 });
  }
```

```ts
// app/api/checkout/program/__tests__/route.native.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn() }));
vi.mock("@/lib/services/sellable-package.service", () => ({ getSellablePackageBySlug: vi.fn() }));
vi.mock("@/lib/payments/program-checkout", () => ({ createProgramCheckoutSession: vi.fn() }));

import { getNativeInfo } from "@/lib/native/server";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { POST } from "../route";

const req = () => new Request("https://app.test/api/checkout/program", { method: "POST", body: JSON.stringify({ slug: "x" }) });

describe("POST /api/checkout/program", () => {
  it("refuses requests from the native shell before touching packages", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "android", appVersion: "1.0.0" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(getSellablePackageBySlug).not.toHaveBeenCalled();
  });

  it("proceeds normally on the web", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
    vi.mocked(getSellablePackageBySlug).mockResolvedValue(null as never);
    expect((await POST(req())).status).toBe(404);
  });
});
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run lib/native components/billing app/api/checkout && npx tsc --noEmit -p tsconfig.json && npx eslint lib/native/landing.ts proxy.ts components/billing "app/p/[slug]/page.tsx" app/api/checkout` → clean. `npm run build` → success, and confirm `/` is still listed as static (`○`).

```bash
git add lib/native/landing.ts lib/native/__tests__/landing.test.ts proxy.ts components/billing "app/p/[slug]/page.tsx" app/api/checkout
git commit -m "feat: keep the landing page, program prices and checkout out of the native app"
```

---

### Task 3: Email-only sign-in on native

**Files:**
- Create: `lib/native/auth-appearance.ts`, `lib/native/__tests__/auth-appearance.test.ts`, `components/auth/native-aware-auth.tsx`
- Modify: `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`

**Interfaces:**
- Produces: `authAppearanceFor(isNative: boolean): { elements: Record<string, { display: "none" }> } | undefined`; `NativeAwareSignIn({ nativeFromServer: boolean })`, `NativeAwareSignUp({ nativeFromServer: boolean })`.

- [ ] **Step 1: Failing test**

```ts
// lib/native/__tests__/auth-appearance.test.ts
import { describe, it, expect } from "vitest";
import { authAppearanceFor } from "../auth-appearance";

describe("authAppearanceFor", () => {
  it("hides social buttons and the divider in the native shell", () => {
    const a = authAppearanceFor(true);
    for (const key of ["socialButtonsBlockButton", "socialButtonsIconButton", "dividerRow"]) {
      expect(a?.elements[key]).toEqual({ display: "none" });
    }
  });
  it("changes nothing on the web", () => {
    expect(authAppearanceFor(false)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/native/auth-appearance.ts
/**
 * Apple 4.8 requires Sign in with Apple whenever another third-party login is
 * offered, and Google blocks OAuth inside Android web views. The shell
 * therefore offers email sign-in only. Style objects (not utility classes)
 * so Clerk's own display rules cannot win.
 */
const HIDDEN = { display: "none" } as const;

export function authAppearanceFor(isNative: boolean) {
  if (!isNative) return undefined;
  return {
    elements: {
      socialButtonsBlockButton: HIDDEN,
      socialButtonsIconButton: HIDDEN,
      dividerRow: HIDDEN,
    } as Record<string, typeof HIDDEN>,
  };
}
```

```tsx
// components/auth/native-aware-auth.tsx
"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useNative } from "@/hooks/use-native";
import { authAppearanceFor } from "@/lib/native/auth-appearance";

/**
 * `nativeFromServer` (user agent) makes the real shell correct on first paint;
 * `useNative()` additionally honours the ?native= dev override in a browser.
 */
export function NativeAwareSignIn({ nativeFromServer }: { nativeFromServer: boolean }) {
  const { isNative } = useNative();
  return <SignIn forceRedirectUrl="/onboarding" appearance={authAppearanceFor(nativeFromServer || isNative)} />;
}

export function NativeAwareSignUp({ nativeFromServer }: { nativeFromServer: boolean }) {
  const { isNative } = useNative();
  return <SignUp forceRedirectUrl="/onboarding" appearance={authAppearanceFor(nativeFromServer || isNative)} />;
}
```

Change both pages to `async` server components: `const native = await getNativeInfo();`, render `<NativeAwareSignIn nativeFromServer={native.isNative} />` / `<NativeAwareSignUp … />` in place of the direct Clerk components, keeping every other element and class. On the sign-up page, when `native.isNative`, change the subtitle from "Start your free trial today" to "Sign up with your email" (trial language invites a purchase question from Apple).

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run lib/native && npx tsc --noEmit -p tsconfig.json && npx eslint lib/native/auth-appearance.ts components/auth app/sign-in app/sign-up && npm run build` → clean.

Browser check (headless) against `npm run dev`: load `/sign-in?native=ios` and `/sign-in?native=off`. Report whether this Clerk instance shows any social buttons on the web at all; if it does, confirm they are hidden under `?native=ios`. If none are configured, say so — the appearance is then a guard for the future. Stop the dev server and remove any browser-tool artifact directory.

```bash
git add lib/native/auth-appearance.ts lib/native/__tests__/auth-appearance.test.ts components/auth app/sign-in app/sign-up
git commit -m "feat: offer email-only sign-in inside the native app"
```

---

### Task 4: Native file saving, sharing and haptics

**Files:**
- Create: `lib/native/download.ts`, `lib/native/__tests__/download.test.ts`, `lib/native/haptics.ts`, `lib/native/__tests__/haptics.test.ts`
- Modify: `components/programs/program-detail-view.tsx` (`handleDownloadPdf`, the Print action), `components/programs/program-list-client.tsx` (`downloadCsv`), `components/workout/workout-session-tracker.tsx` (`handleLogSet`), `components/workout/workout-checklist-tracker.tsx` (`handleLogSet`), `app/(platform)/check-ins/[id]/respond/respond-form.tsx` (`handleSubmit`), `lib/native/lifecycle.ts` + its test (same-origin `target="_blank"`), `package.json`, `package-lock.json`, `mobile/package.json`, `mobile/package-lock.json`, generated plugin registration under `mobile/ios/**` and `mobile/android/**`

**Interfaces:**
- Produces:
  ```ts
  export function safeFilename(name: string, fallback?: string): string;
  export interface DownloadDeps { isNative(): boolean; webDownload(blob: Blob, filename: string): void; writeCacheFile(filename: string, base64: string): Promise<string>; share(options: { title: string; files: string[] }): Promise<void>; }
  export async function saveOrDownload(blob: Blob, filename: string, deps?: DownloadDeps): Promise<void>;
  export async function haptic(style?: "light" | "medium"): Promise<void>;
  ```

- [ ] **Step 1: Install the three plugins in both packages**

Run: `npm install --no-audit --no-fund --save-exact @capacitor/filesystem@8.1.3 @capacitor/share@8.0.2 @capacitor/haptics@8.0.2` at the root, and the same inside `mobile/`. Then `cd mobile && npm run sync && npm run verify && npm test`. Expected: sync registers the plugins in the iOS SPM package and the Android settings; verify OK.

- [ ] **Step 2: Failing tests for the download bridge**

```ts
// lib/native/__tests__/download.test.ts
import { describe, it, expect, vi } from "vitest";
import { safeFilename, saveOrDownload, type DownloadDeps } from "../download";

describe("safeFilename", () => {
  it("keeps ordinary names", () => expect(safeFilename("week-1.pdf")).toBe("week-1.pdf"));
  it("strips path separators and control characters", () => {
    expect(safeFilename("../../etc/pass\u0000wd.pdf")).toBe("etc_passwd.pdf");
    expect(safeFilename("a/b\\c.csv")).toBe("a_b_c.csv");
  });
  it("keeps the extension when truncating very long names", () => {
    const out = safeFilename(`${"x".repeat(300)}.pdf`);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(".pdf")).toBe(true);
  });
  it("falls back when nothing usable remains", () => {
    expect(safeFilename("///", "program.pdf")).toBe("program.pdf");
  });
});

function deps(overrides: Partial<DownloadDeps> = {}): DownloadDeps {
  return {
    isNative: () => true,
    webDownload: vi.fn(),
    writeCacheFile: vi.fn(async () => "file:///cache/x.pdf"),
    share: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("saveOrDownload", () => {
  const blob = new Blob(["hello"], { type: "application/pdf" });

  it("uses a normal download on the web", async () => {
    const d = deps({ isNative: () => false });
    await saveOrDownload(blob, "a.pdf", d);
    expect(d.webDownload).toHaveBeenCalledWith(blob, "a.pdf");
    expect(d.writeCacheFile).not.toHaveBeenCalled();
  });

  it("writes to the cache and opens the share sheet on native", async () => {
    const d = deps();
    await saveOrDownload(blob, "Week 1/Plan.pdf", d);
    expect(d.writeCacheFile).toHaveBeenCalledWith("Week 1_Plan.pdf", "aGVsbG8=");
    expect(d.share).toHaveBeenCalledWith({ title: "Week 1_Plan.pdf", files: ["file:///cache/x.pdf"] });
  });

  it("treats a cancelled share sheet as success", async () => {
    const d = deps({ share: vi.fn(async () => { throw new Error("Share canceled"); }) });
    await expect(saveOrDownload(blob, "a.pdf", d)).resolves.toBeUndefined();
  });

  it("propagates real failures so callers can show an error", async () => {
    const d = deps({ writeCacheFile: vi.fn(async () => { throw new Error("disk full"); }) });
    await expect(saveOrDownload(blob, "a.pdf", d)).rejects.toThrow("disk full");
  });
});
```

Run → FAIL.

- [ ] **Step 3: Implement the bridge**

```ts
// lib/native/download.ts
/**
 * Blob downloads (<a download>) silently do nothing in iOS web views. Inside
 * the shell, write the file to the app cache and open the system share sheet,
 * which offers Save to Files, Print, Mail and so on (spec §5).
 */
import { Capacitor } from "@capacitor/core";

const MAX_NAME = 100;

export function safeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/^[_.]+/, "")
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_NAME) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_NAME - ext.length) + ext;
}

export interface DownloadDeps {
  isNative(): boolean;
  webDownload(blob: Blob, filename: string): void;
  writeCacheFile(filename: string, base64: string): Promise<string>;
  share(options: { title: string; files: string[] }): Promise<void>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function defaultDeps(): DownloadDeps {
  return {
    isNative: () => Capacitor.isNativePlatform(),
    webDownload,
    writeCacheFile: async (filename, base64) => {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      return uri;
    },
    share: async (options) => {
      const { Share } = await import("@capacitor/share");
      await Share.share(options);
    },
  };
}

function isShareCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

export async function saveOrDownload(blob: Blob, filename: string, deps: DownloadDeps = defaultDeps()): Promise<void> {
  const name = safeFilename(filename);
  if (!deps.isNative()) {
    deps.webDownload(blob, name);
    return;
  }
  const uri = await deps.writeCacheFile(name, await blobToBase64(blob));
  try {
    await deps.share({ title: name, files: [uri] });
  } catch (error) {
    if (!isShareCancel(error)) throw error;
  }
}
```

Run → PASS, 8 tests.

- [ ] **Step 4: Use it at the call sites**

- `program-detail-view.tsx` `handleDownloadPdf`: keep the fetch and the `res.ok` check; replace the object-URL/anchor block with `await saveOrDownload(blob, \`${…same sanitised name…}.pdf\`)` inside a `try`, with `toast.error("Failed to save PDF")` on catch.
- The Print action currently `window.open(pdfUrl)`. The PDF route needs the session cookie, which the system browser does not have, so on native fetch the PDF and call `saveOrDownload` (the share sheet offers Print). Implement: `onSelect: () => (Capacitor.isNativePlatform() ? handleDownloadPdf() : window.open(pdfUrl))`.
- `program-list-client.tsx` `downloadCsv`: build the blob as today, then `void saveOrDownload(blob, filename).catch(() => toast.error("Failed to export CSV"))` (import `toast` from `sonner` if the file doesn't already).

- [ ] **Step 5: Haptics**

```ts
// lib/native/__tests__/haptics.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
const impact = vi.fn();
vi.mock("@capacitor/haptics", () => ({ Haptics: { impact }, ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" } }));

import { haptic } from "../haptics";

describe("haptic", () => {
  it("does nothing on the web", async () => {
    await haptic();
    expect(impact).not.toHaveBeenCalled();
  });
});
```

```ts
// lib/native/haptics.ts
import { Capacitor } from "@capacitor/core";

/** A light tap inside the native shell (spec §5); a no-op everywhere else. */
export async function haptic(style: "light" | "medium" = "light"): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // Haptics are a nicety; never let them affect the action that triggered them.
  }
}
```

Call `void haptic();` after a set is logged successfully in both `handleLogSet` functions, and `void haptic("medium");` after a check-in submits successfully in `respond-form.tsx` `handleSubmit`. Read each handler first; place the call only on the success path.

- [ ] **Step 6: Same-origin new-tab links in the shell**

A native web view has no tabs: on Android a same-origin `target="_blank"` link replaces the app page (e.g. the public program-brief template). In `lib/native/lifecycle.ts`'s click handler, also send same-origin anchors whose `target` attribute is `_blank` to `deps.browser.open(absoluteUrl)`. Note in a comment that this suits public files; authenticated pages opened this way would lack the session. Extend the fake anchor in `lifecycle.test.ts` so `getAttribute` answers both `href` and `target`, and add tests: same-origin `_blank` → `browser.open` called with the absolute URL; same-origin without `target` → untouched.

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run lib/native components && npx tsc --noEmit -p tsconfig.json && npm run build`, eslint each modified file individually (quote paths), and `cd mobile && npm run verify && npm test`.

```bash
git add lib/native package.json package-lock.json mobile components/programs components/workout "app/(platform)/check-ins"
git commit -m "feat: save and share files natively, add haptics, and open new-tab links outside the app"
```

---

### Task 5: Universal links, app links and the custom scheme

**Files:**
- Create: `lib/native/deep-link-paths.json`, `lib/native/deep-links.ts`, `lib/native/__tests__/deep-links.test.ts`, `app/.well-known/apple-app-site-association/route.ts`, `app/.well-known/assetlinks.json/route.ts`, `app/.well-known/__tests__/well-known.test.ts`, `mobile/ios/App/App/App.entitlements`
- Modify: `proxy.ts`, `lib/native/lifecycle.ts` + test, `components/providers/native-provider.tsx`, `mobile/ios/App/App.xcodeproj/project.pbxproj`, `mobile/ios/App/App/Info.plist`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/scripts/verify.cjs` + test, `mobile/README.md`

**Interfaces:**
- Produces:
  ```ts
  export const APP_HOST = "app.goinmotus.com";
  export const APP_SCHEME = "inmotus";
  export const DEEP_LINK_PATH_PREFIXES: readonly string[];
  export function pathFromAppUrl(url: string, host?: string): string | null;
  export function buildAppleAppSiteAssociation(teamId: string): object;
  export function buildAssetLinks(fingerprints: string[]): object[];
  ```
  `LifecycleDeps` gains `app.addListener("appUrlOpen", …)`, `app.getLaunchUrl()`, and `navigate(path: string): void`.

- [ ] **Step 1: The path list and pure helpers, test first**

```json
["/dashboard", "/programs", "/messages", "/calendar", "/sessions", "/nutrition", "/clients", "/check-ins", "/settings", "/p", "/onboarding", "/sign-in"]
```
(save as `lib/native/deep-link-paths.json`)

```ts
// lib/native/__tests__/deep-links.test.ts
import { describe, it, expect } from "vitest";
import { buildAppleAppSiteAssociation, buildAssetLinks, DEEP_LINK_PATH_PREFIXES, pathFromAppUrl } from "../deep-links";

describe("pathFromAppUrl", () => {
  it("maps a universal link to an in-app path, keeping query and hash", () => {
    expect(pathFromAppUrl("https://app.goinmotus.com/messages/abc?x=1#m2")).toBe("/messages/abc?x=1#m2");
  });
  it("maps the custom scheme", () => {
    expect(pathFromAppUrl("inmotus://clients/42")).toBe("/clients/42");
    expect(pathFromAppUrl("inmotus:///dashboard")).toBe("/dashboard");
  });
  it("ignores other hosts and schemes", () => {
    expect(pathFromAppUrl("https://evil.example/dashboard")).toBeNull();
    expect(pathFromAppUrl("https://app.goinmotus.com.evil.io/x")).toBeNull();
    expect(pathFromAppUrl("mailto:a@b.c")).toBeNull();
    expect(pathFromAppUrl("not a url")).toBeNull();
  });
  it("never returns a protocol-relative path that could leave the origin", () => {
    expect(pathFromAppUrl("inmotus:////evil.com")).toBeNull();
    expect(pathFromAppUrl("https://app.goinmotus.com//evil.com")).toBeNull();
  });
});

describe("association files", () => {
  it("builds the AASA with the team-qualified app ID and every prefix", () => {
    const aasa = buildAppleAppSiteAssociation("ABCDE12345") as { applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] } };
    expect(aasa.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.goinmotus.app"]);
    expect(aasa.applinks.details[0].components.map((c) => c["/"])).toEqual(DEEP_LINK_PATH_PREFIXES.flatMap((p) => [p, `${p}/*`]));
  });
  it("builds assetlinks with the package and fingerprints", () => {
    const links = buildAssetLinks(["AA:BB"]) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(links[0].target.package_name).toBe("com.goinmotus.app");
    expect(links[0].target.sha256_cert_fingerprints).toEqual(["AA:BB"]);
  });
});
```

```ts
// lib/native/deep-links.ts
import paths from "./deep-link-paths.json";

export const APP_HOST = "app.goinmotus.com";
export const APP_SCHEME = "inmotus";
export const APP_ID = "com.goinmotus.app";
/** Single source for the AASA route, the Android manifest check and tests. */
export const DEEP_LINK_PATH_PREFIXES: readonly string[] = paths;

function safePath(path: string): string | null {
  // "//evil.com" would be a protocol-relative URL: never navigate there.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function pathFromAppUrl(url: string, host: string = APP_HOST): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol === "https:" && u.hostname === host) {
    return safePath(`${u.pathname}${u.search}${u.hash}`);
  }
  if (u.protocol === `${APP_SCHEME}:`) {
    // inmotus://clients/42 parses with host "clients"; inmotus:///x has an empty host.
    const path = u.host ? `/${u.host}${u.pathname === "/" ? "" : u.pathname}` : u.pathname;
    return safePath(`${path}${u.search}${u.hash}`);
  }
  return null;
}

export function buildAppleAppSiteAssociation(teamId: string) {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_ID}`],
          components: DEEP_LINK_PATH_PREFIXES.flatMap((p) => [{ "/": p }, { "/": `${p}/*` }]),
        },
      ],
    },
  };
}

export function buildAssetLinks(fingerprints: string[]) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
```

If `resolveJsonModule` is off in `tsconfig.json`, turn it on and say so. Run → PASS.

- [ ] **Step 2: Well-known routes, public in `proxy.ts`**

```ts
// app/.well-known/apple-app-site-association/route.ts
import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/native/deep-links";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new NextResponse("Not configured", { status: 404 });
  return NextResponse.json(buildAppleAppSiteAssociation(teamId), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
```

```ts
// app/.well-known/assetlinks.json/route.ts
import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/native/deep-links";

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (fingerprints.length === 0) return new NextResponse("Not configured", { status: 404 });
  return NextResponse.json(buildAssetLinks(fingerprints), { headers: { "Cache-Control": "public, max-age=3600" } });
}
```

Test both in `app/.well-known/__tests__/well-known.test.ts`: 404 when the env var is unset; JSON with the right shape and `content-type: application/json` when set (set/unset `process.env` within the test and restore it). Add `"/.well-known/(.*)"` to `isPublicRoute` in `proxy.ts`. Confirm after `npm run build` that both routes appear in the route listing; if Next rejects the `.well-known` folder name, say so and use a `rewrites()` entry in `next.config.ts` mapping `/.well-known/...` to `/api/well-known/...` instead.

- [ ] **Step 3: Handle opened URLs in the lifecycle, and fix Plan 2's residual**

In `lib/native/lifecycle.ts`:
- Extend `LifecycleDeps.app` with `addListener(event: "appUrlOpen", fn: (e: { url: string }) => void)` and `getLaunchUrl(): Promise<{ url: string } | undefined>`, and add `navigate(path: string): void` to `LifecycleDeps`.
- Register `appUrlOpen`: `const path = pathFromAppUrl(url); if (path) deps.navigate(path);`.
- After registration, `deps.app.getLaunchUrl().then((l) => { const p = l && pathFromAppUrl(l.url); if (p && p !== "/") deps.navigate(p); }).catch(ignore)` — covers a cold start from a link.
- **Plan 2 residual:** in the resume handler's online branch, set `refreshOwed = false` before calling `onResumeAfterLongPause`, so a debt already serviced by a later online resume is not refreshed again on the next connectivity event.

Tests in `lib/native/__tests__/lifecycle.test.ts` (update the fake `app` with the new listener and `getLaunchUrl`, and `deps.navigate`): `appUrlOpen` with a universal link navigates to its path; with a foreign host does nothing; a cold-start launch URL navigates once; and the two-cycle residual — long pause offline (debt owed) → second long pause resumes online (refresh #1) → a later `networkStatusChange` to connected must NOT refresh again (total 1). The cleanup test now expects four removed listeners.

In `native-provider.tsx`, pass `navigate: (path) => router.push(path)`.

- [ ] **Step 4: Native project wiring**

`mobile/ios/App/App/App.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>applinks:app.goinmotus.com</string>
	</array>
</dict>
</plist>
```

In `project.pbxproj`, add `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` to the **Release** build configuration of the **App target** only (the Release block that contains `PRODUCT_BUNDLE_IDENTIFIER = com.goinmotus.app;`), not Debug and not the project-level blocks. Reason: a free Personal Team cannot sign Associated Domains, and the owner runs Debug builds on their own phone.

In `Info.plist`, register the custom scheme:

```xml
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>com.goinmotus.app</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>inmotus</string>
			</array>
		</dict>
	</array>
```

In `AndroidManifest.xml`, inside the main `<activity>`, add an auto-verified HTTPS filter with one `<data android:pathPrefix=…>` per entry in `lib/native/deep-link-paths.json`, and a custom-scheme filter:

```xml
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="app.goinmotus.com" />
                <data android:pathPrefix="/dashboard" />
                <!-- …one line per prefix in lib/native/deep-link-paths.json… -->
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="inmotus" />
            </intent-filter>
```

Write every prefix out explicitly (the comment line above is shorthand in this plan only; the committed manifest must list all twelve).

Validate: `plutil -lint mobile/ios/App/App/App.entitlements mobile/ios/App/App/Info.plist` → OK.

- [ ] **Step 5: Verify the wiring in `verify.cjs`**

Add and export `checkDeepLinks({ entitlements, pbxproj, infoPlist, manifest, paths })` returning problems unless: the entitlements contain `applinks:app.goinmotus.com`; the pbxproj contains `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` exactly once; the Info.plist registers the `inmotus` scheme; the manifest has `android:autoVerify="true"`, `android:host="app.goinmotus.com"`, `android:scheme="inmotus"`, and a `pathPrefix` for every entry of `paths`. `main()` reads `paths` from `../../lib/native/deep-link-paths.json` (relative to `mobile/scripts/`) and runs the check in the normal (non-release) path. Tests: a fully wired fixture passes; missing entitlement, a missing prefix, and entitlements referenced twice are each flagged.

Run: `cd mobile && npm run sync && npm run verify && npm test` → OK.

- [ ] **Step 6: README and commit**

Add to `mobile/README.md` a "Links that open the app" section: set `APPLE_TEAM_ID` (Apple Developer → Membership) and `ANDROID_SHA256_CERT_FINGERPRINTS` (Play Console → App integrity → App signing key certificate SHA-256) in Vercel for Production; then check `https://app.goinmotus.com/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` load as JSON. Explain that Associated Domains is enabled only in Release builds, so free-Apple-ID Debug builds on your own phone keep working, and that universal links are therefore testable only from a TestFlight/Release build; `inmotus://dashboard` works in any build. Add the new env vars to the secrets/config section.

Run: `npx vitest run lib/native app/.well-known components/providers && npx tsc --noEmit -p tsconfig.json && npm run build`, eslint each changed web file individually.

```bash
git add lib/native app/.well-known proxy.ts components/providers mobile tsconfig.json
git commit -m "feat: open universal links, app links and inmotus:// links inside the app"
```
(Drop `tsconfig.json` from the add if Step 1 did not change it.)

---

### Task 6: Minimum-version gate

**Files:**
- Create: `lib/native/version.ts`, `lib/native/__tests__/version.test.ts`, `app/api/mobile/config/route.ts`, `app/api/mobile/config/__tests__/route.test.ts`, `components/layout/update-required-screen.tsx`, `components/layout/__tests__/update-required-screen.test.tsx`
- Modify: `proxy.ts`, `lib/native/lifecycle.ts` + test (`onResume` for every resume), `components/providers/native-provider.tsx`, `mobile/README.md`

**Interfaces:**
- Produces:
  ```ts
  export function isVersionBelow(current: string | undefined, minimum: string | undefined): boolean;
  export interface MobileConfig { minSupportedVersion: { ios: string; android: string }; storeUrls: { ios: string | null; android: string | null } }
  export async function checkForRequiredUpdate(args: { platform: "ios" | "android"; appVersion: string; fetchConfig: () => Promise<MobileConfig> }): Promise<{ storeUrl: string | null } | null>;
  export function UpdateRequiredScreen(props: { platform: "ios" | "android"; storeUrl: string | null; onOpenStore(url: string): void }): JSX.Element;
  ```
  `LifecycleDeps` gains `onResume(): void` (every return to foreground).

- [ ] **Step 1: Failing tests**

```ts
// lib/native/__tests__/version.test.ts
import { describe, it, expect, vi } from "vitest";
import { checkForRequiredUpdate, isVersionBelow, type MobileConfig } from "../version";

describe("isVersionBelow", () => {
  it("compares numerically, not lexically", () => {
    expect(isVersionBelow("1.9.0", "1.10.0")).toBe(true);
    expect(isVersionBelow("1.10.0", "1.9.0")).toBe(false);
    expect(isVersionBelow("1.2.3", "1.2.3")).toBe(false);
  });
  it("never blocks on missing or malformed input", () => {
    expect(isVersionBelow(undefined, "2.0.0")).toBe(false);
    expect(isVersionBelow("1.0.0", undefined)).toBe(false);
    expect(isVersionBelow("1.0.0", "two")).toBe(false);
    expect(isVersionBelow("0.0.0-debug", "9.0.0")).toBe(false);
  });
});

const config = (min: string): MobileConfig => ({
  minSupportedVersion: { ios: min, android: min },
  storeUrls: { ios: "https://apps.apple.com/app/id1", android: null },
});

describe("checkForRequiredUpdate", () => {
  it("requires an update below the minimum and returns the platform's store URL", async () => {
    await expect(checkForRequiredUpdate({ platform: "ios", appVersion: "1.0.0", fetchConfig: async () => config("1.1.0") }))
      .resolves.toEqual({ storeUrl: "https://apps.apple.com/app/id1" });
  });
  it("returns null at or above the minimum", async () => {
    await expect(checkForRequiredUpdate({ platform: "android", appVersion: "1.1.0", fetchConfig: async () => config("1.1.0") })).resolves.toBeNull();
  });
  it("returns null when the config cannot be fetched", async () => {
    await expect(checkForRequiredUpdate({ platform: "ios", appVersion: "1.0.0", fetchConfig: vi.fn(async () => { throw new Error("offline"); }) })).resolves.toBeNull();
  });
});
```

```ts
// lib/native/version.ts
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(v: string | undefined): [number, number, number] | null {
  const m = v ? SEMVER.exec(v.trim()) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** False whenever either side is missing or malformed: bad config must never lock users out. */
export function isVersionBelow(current: string | undefined, minimum: string | undefined): boolean {
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

export interface MobileConfig {
  minSupportedVersion: { ios: string; android: string };
  storeUrls: { ios: string | null; android: string | null };
}

export async function checkForRequiredUpdate(args: {
  platform: "ios" | "android";
  appVersion: string;
  fetchConfig: () => Promise<MobileConfig>;
}): Promise<{ storeUrl: string | null } | null> {
  let config: MobileConfig;
  try {
    config = await args.fetchConfig();
  } catch {
    return null;
  }
  if (!isVersionBelow(args.appVersion, config.minSupportedVersion?.[args.platform])) return null;
  return { storeUrl: config.storeUrls?.[args.platform] ?? null };
}
```

Run → PASS.

- [ ] **Step 2: Config endpoint (public)**

```ts
// app/api/mobile/config/route.ts
import { NextResponse } from "next/server";
import type { MobileConfig } from "@/lib/native/version";

export function GET() {
  const body: MobileConfig = {
    minSupportedVersion: {
      ios: process.env.MOBILE_MIN_VERSION_IOS?.trim() || "1.0.0",
      android: process.env.MOBILE_MIN_VERSION_ANDROID?.trim() || "1.0.0",
    },
    storeUrls: {
      ios: process.env.NEXT_PUBLIC_IOS_STORE_URL?.trim() || null,
      android: process.env.NEXT_PUBLIC_ANDROID_STORE_URL?.trim() || null,
    },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
```

Test: defaults when env unset; env values when set. Add `"/api/mobile/config"` to `isPublicRoute` in `proxy.ts`.

- [ ] **Step 3: The blocking screen**

```tsx
// components/layout/update-required-screen.tsx
"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UpdateRequiredScreen({
  platform,
  storeUrl,
  onOpenStore,
}: {
  platform: "ios" | "android";
  storeUrl: string | null;
  onOpenStore(url: string): void;
}) {
  const store = platform === "ios" ? "the App Store" : "Google Play";
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background px-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Download className="size-10 text-primary" aria-hidden />
        <h1 id="update-required-title" className="text-xl font-semibold text-foreground">Update required</h1>
        <p className="text-sm text-muted-foreground">
          A newer version of Inmotus RX is available. Please update from {store} to keep using the app.
        </p>
        {storeUrl && <Button onClick={() => onOpenStore(storeUrl)}>Open {store}</Button>}
      </div>
    </div>
  );
}
```

Test: renders the title, `role="alertdialog"`, the right store name per platform, and no button when `storeUrl` is null.

- [ ] **Step 4: Wire it into the provider**

- In `lib/native/lifecycle.ts`, call a new `deps.onResume()` on every return to the foreground (in addition to the existing long-pause logic). Update the fake and add a test that it fires on each resume.
- In `native-provider.tsx`: keep `const [updateRequired, setUpdateRequired] = useState<{ storeUrl: string | null } | null>(null)` and a `resumeTick` counter incremented by `onResume`. An effect on `[info.isNative, info.platform, info.appVersion, resumeTick]` runs only when `Capacitor.isNativePlatform()` and `info.appVersion` and `info.platform` are set, calling `checkForRequiredUpdate({ platform, appVersion, fetchConfig: () => fetch("/api/mobile/config").then((r) => r.json()) })` and storing the result. Render `{updateRequired && info.platform && <UpdateRequiredScreen platform={info.platform} storeUrl={updateRequired.storeUrl} onOpenStore={(url) => import("@capacitor/browser").then(({ Browser }) => Browser.open({ url }))} />}` after `children` inside the context provider.
- `mobile/README.md`: document `MOBILE_MIN_VERSION_IOS/ANDROID` and the store URL env vars (set store URLs once listings exist; raise the minimum only after the new version is live in both stores).

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run lib/native components app/api/mobile && npx tsc --noEmit -p tsconfig.json && npm run build`; eslint each changed file.

```bash
git add lib/native app/api/mobile components/layout/update-required-screen.tsx components/layout/__tests__/update-required-screen.test.tsx components/providers proxy.ts mobile/README.md
git commit -m "feat: add a remote minimum-version gate for the native apps"
```

---

### Task 7: Full verification

**Files:** none.

- [ ] **Step 1:** `cd mobile && npm run sync && npm test && npm run verify && npm run verify:release` → all OK.
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` clean; `npx vitest run` — only known timezone-dependent failures in `client-dashboard-render.test.tsx`, if any; `npm run build` succeeds, `/` still static, `/.well-known/*` and `/api/mobile/config` listed.
- [ ] **Step 3:** Lint every web file this plan touched, individually, quoted: `git diff --name-only <plan-base> HEAD | grep -E '\.(ts|tsx)$' | grep -v '^mobile/'` → 0 errors.
- [ ] **Step 4:** Native-UA smoke with curl against `npm run dev` (signed out): `curl -s -A "Mozilla/5.0 InmotusApp/1.0.0 (ios)" -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/` → 307 to `/sign-in`; same without the marker → 200. `curl -s -X POST -A "…InmotusApp/1.0.0 (ios)" http://localhost:3000/api/checkout/program -d '{"slug":"x"}'` → 403. `curl -s http://localhost:3000/api/mobile/config` → JSON with `1.0.0` defaults. `/.well-known/apple-app-site-association` → 404 with no env var set. Headless browser: `/sign-in?native=ios` renders the email form. Stop the server; remove browser artifacts.
- [ ] **Step 5:** `git status --short` shows no stray files.
- [ ] **Step 6:** Report what only the owner can verify: universal links from a Release/TestFlight build with `APPLE_TEAM_ID` set; Android App Links verification after the Play signing fingerprint is set; the share sheet and haptics on a device; the attention screen for a real expired-trial trainer in the app.

---

## Self-review

- **§7 billing gate:** attention screen on `/billing`, success/cancel redirects, settings billing, nav hidden, purchase page, checkout 403 — Tasks 1–2; landing-page pricing added (not in spec, same rule). ✔
- **§6 email-only sign-in:** Task 3. Clerk session length and Clerk production domains remain Plan 0 owner items. ✔
- **§5 links and downloads, haptics:** Task 4 (bridge, Print via share sheet, haptics at set completion and check-in submit, same-origin new-tab links carried from Plan 2's review). ✔
- **§9 deep links and version gate:** Tasks 5–6; custom scheme; config endpoint cached 5 min, env-driven. ✔
- **Plan 2 residual (`refreshOwed`):** Task 5 Step 3 with a two-cycle test. ✔
- **Review Focus:** 1 → Task 1 Step 6; 2 → Task 5 Step 1; 3–4 → Task 4 Step 2; 5 → Task 6 Step 1. ✔
- **Type consistency:** `NavOptions`, `getAccountNav(role, options)`, `getMoreItems(role, isAdmin, options)`, `SubscriptionAttentionScreen`, `nativeLandingRedirect`, `authAppearanceFor`, `saveOrDownload`, `safeFilename`, `haptic`, `pathFromAppUrl`, `DEEP_LINK_PATH_PREFIXES`, `isVersionBelow`, `checkForRequiredUpdate`, `MobileConfig`, `UpdateRequiredScreen` used identically across tasks. ✔


---

## Execution record (2026-09-26)

Executed via subagent-driven development: commits a368de1..a00b428 on `mobile-app-capacitor`. Every task passed review (Task 5 after two fix rounds, including an adversarial fuzz of 579,058 deep-link inputs); a whole-plan review and one fix wave followed.

Rulings made during execution, in order:

1. T1's mobile-tab-bar isNative test is a render/wiring smoke only (closed sheet renders nothing); the behavioural guarantee lives in the nav-items native tests and the sidebar parity native case — accept — cost: none.
2. the plan's attention-screen test asserts no "http" anywhere, which lucide's SVG xmlns (http://www.w3.org/2000/svg) trips — a plan defect. Accept the implementer's fix (icon replaced by a plain decorative circle) rather than loosen the assertion, because "no URL of any kind" is the stronger guard against payment links — cost: slightly plainer screen.
3. both are in scope of the Global Constraint "email-only sign-in on native", so they enter Task 3's fix loop rather than a new task. Connected-accounts hiding uses Clerk's documented profileSection__connectedAccounts key, unverifiable locally (Clerk UI loads from CDN; screen is behind login) — added to the owner's device checklist — cost: if the key is wrong, the section simply stays visible.
4. fix safePath by resolving against the app origin and comparing origins (not pattern matching) plus rejecting backslashes/control chars; dedupe launch handling with a sessionStorage-backed lastHandled guard injected via deps — cost: small.
5. server.allowNavigation's "*.clerk.accounts.dev" and "*.accounts.dev" wildcards let any Clerk dev instance load in the web view via redirects. Needed today only because the Clerk instance is a dev instance. Once production Clerk lives under *.goinmotus.com (Plan 0), drop both wildcards and have verify:release refuse them. Surfaced to owner — cost: until then, a server-side redirect to another accounts.dev host would stay in-app (only Clerk redirects there).
6. ONE fix dispatch covering — drop "/settings" and "/p" from deep-link-paths.json + Android manifest (dunning email CTA /settings/billing would open the app's no-payment screen; trainer sales links /p/* would open the app where prospects cannot buy; spec §9's /p predates §7's gate); hide the sell-program price UI on native (only price UI a reviewer on the demo trainer can reach); render legal pages without the marketing navbar/footer ("Pricing" link) on native by making /privacy and /terms read getNativeInfo (they become dynamic — acceptable for two small pages); README: env changes need a redeploy. Not fixing: portalled sheets not covered by the inert wrapper (cosmetic), Sign out on native /settings/billing (harmless).
7. tighten server.allowNavigation NOW — replace "*.clerk.accounts.dev" and "*.accounts.dev" with the exact Clerk frontend-API host decoded from NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY at sync time; REQUIRED_HOSTS becomes app host + *.goinmotus.com; verify:release refuses any accounts.dev entry. Reason: the only in-webview accounts.dev navigation is Clerk's handshake to one host, and the wildcard let any Clerk dev instance load in-app — cost: a sync without the key in env/.env files omits the Clerk host (verify will say so).
8. (Task 7 verification) A signed-out native `POST /api/stripe/checkout` returned 307 to sign-in rather than 403, because Clerk middleware protects that route before the handler runs. Not a defect: a signed-out request cannot purchase anything, and a signed-in native request reaches the handler's 403, which is unit-tested. Cost if wrong: none.
