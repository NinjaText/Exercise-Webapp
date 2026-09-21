# Mobile Web Foundation Implementation Plan (Plan 1 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Next.js app aware of, and comfortable inside, the native Capacitor shell: native detection, a bottom tab bar, safe-area handling, native-only CSS, public legal pages, and in-app account deletion.

**Architecture:** A pure user-agent parser plus a client-side `NativeProvider` give one `useNative()` contract for the whole app. Navigation arrays move out of the sidebar into `nav-items.ts` so the new `MobileTabBar` and the existing `Sidebar` share one source of truth. Account deletion reuses the admin hard-delete sequence, extracted into a service, behind a self-serve server action.

**Tech Stack:** Next.js 16.1 App Router, React 19.2, Tailwind CSS v4 with semantic tokens, shadcn/base-ui primitives, Clerk 7, Prisma 6 on MongoDB, Vitest 4 (node environment, `renderToStaticMarkup` for component tests), `@capacitor/core` (new root dependency).

**Spec:** `docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md` — sections 4, 5, 6 (account deletion, legal pages). Roadmap: `docs/superpowers/plans/2026-09-21-mobile-app-roadmap.md`.

## Global Constraints

- Colors only via semantic tokens (`bg-card`, `text-primary`, `border-border`, …). Raw palette classes (`bg-white`, `text-slate-900`, `bg-blue-50`) fail `design/no-raw-palette`, which is an ESLint **error**.
- Native user-agent marker format is exactly `InmotusApp/<semver> (<ios|android>)`.
- Dev override query param is `?native=ios|android|off`, stored under `localStorage` key `inmotus:native-override`; honored only when `NODE_ENV !== "production"` or `NEXT_PUBLIC_NATIVE_DEBUG=1`.
- The `<html>` element carries `data-native` (boolean attribute) and `data-platform="ios|android"` when native.
- CSS variables: `--safe-top`, `--safe-bottom`, `--tab-bar-height: 3.5rem`.
- Tab bar shows below the `lg` breakpoint on web and native alike. Tabs: Client → Dashboard, Programs, Calendar, Nutrition, Inbox. Trainer → Dashboard, Clients, Programs, Inbox, More.
- Header keeps its menu button on small screens for secondary navigation.
- Account deletion confirmation phrase is `DELETE`. Trainers with active clients are blocked; no cascade to client data.
- Public routes added to `proxy.ts`: `/privacy`, `/terms`, `/account-deleted`.
- Tests live next to code in `__tests__` folders, mock `@/lib/prisma` and `@/lib/current-user` the way `actions/__tests__/checkin-actions.test.ts` does, and render components with `renderToStaticMarkup`.
- **Each task ends with one commit** covering exactly that task's files, using a Conventional Commit subject (`feat:`, `refactor:`, `test:`, `docs:`) and ending with a `Co-Authored-By:` trailer naming **the model that actually wrote the commit** (each implementer stamps its own; do not copy another model's name). The repo owner reviews the branch before any push; **nothing is pushed from this run**.
- Never run `git push`, `git rebase`, `git reset --hard`, or `git checkout` of another branch. Commit only the files your own task lists.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/native/platform.ts` (create) | Pure: `NativeInfo` type, `parseNativeUserAgent`, `resolveNativeInfo`. No Next or DOM imports. |
| `lib/native/server.ts` (create) | `getNativeInfo()` for server components; reads `headers()`. |
| `lib/native/__tests__/platform.test.ts` (create) | Unit tests for the pure module. |
| `components/providers/native-provider.tsx` (create) | Client context: detection, `data-native` attribute, viewport tweak, online status, `useNative()`. |
| `hooks/use-native.ts` (create) | Re-export of `useNative` so hooks live where the codebase expects them. |
| `components/providers/__tests__/native-provider.test.tsx` (create) | Static render smoke test. |
| `components/layout/nav-items.ts` (create) | Nav arrays with phone tiers, tab layout per role, `findActiveHref`. |
| `components/layout/__tests__/nav-items.test.ts` (create) | Tab sets, More items, active matching. |
| `components/layout/sidebar.tsx` (modify) | Consume `nav-items.ts`; no visual change. |
| `components/layout/mobile-tab-bar.tsx` (create) | Bottom tab bar + More sheet. |
| `components/layout/__tests__/mobile-tab-bar.test.tsx` (create) | Static render per role. |
| `components/layout/header.tsx` (modify) | Safe-area top padding. |
| `app/(platform)/layout.tsx` (modify) | Mount `MobileTabBar`; bottom padding on `<main>`. |
| `app/layout.tsx` (modify) | `viewport` export with `viewportFit: "cover"`; mount `NativeProvider`. |
| `app/globals.css` (modify) | Safe-area variables and `html[data-native]` rules. |
| `lib/legal/company.ts` (create) | Legal entity name, contact email, governing law — three values the owner confirms. |
| `lib/legal/privacy-policy.ts`, `lib/legal/terms-of-service.ts` (create) | Structured document content. |
| `components/legal/legal-document.tsx` (create) | Renders a legal document with site navbar and footer. |
| `components/legal/__tests__/legal-document.test.tsx` (create) | Static render test. |
| `app/privacy/page.tsx`, `app/terms/page.tsx` (create) | Public pages. |
| `components/layout/site-footer.tsx` (modify) | Real hrefs for Privacy and Terms. |
| `proxy.ts` (modify) | Public routes. |
| `lib/services/user-deletion.service.ts` (create) | `findDeletionBlockers`, `deleteUserData`, extracted from the admin action. |
| `lib/services/__tests__/user-deletion.service.test.ts` (create) | Blocker detection tests. |
| `actions/admin-actions.ts` (modify) | `deleteUserAction` delegates to the service. |
| `actions/__tests__/admin-actions.test.ts` (modify) | Mock the service; fix the three currently failing delete tests. |
| `lib/constants/account.ts` (create) | `DELETE_CONFIRMATION_PHRASE`. |
| `actions/account-actions.ts` (create) | `deleteOwnAccountAction`. |
| `actions/__tests__/account-actions.test.ts` (create) | Action tests. |
| `app/account-deleted/page.tsx` (create) | Post-deletion landing page. |
| `components/settings/delete-account-section.tsx` (create) | Danger-zone card with confirmation dialog. |
| `components/settings/__tests__/delete-account-section.test.tsx` (create) | Static render test. |
| `app/(platform)/settings/page.tsx` (modify) | Mount the section and legal links. |

---

### Task 1: Native detection — pure module and server helper

**Files:**
- Create: `lib/native/platform.ts`
- Create: `lib/native/server.ts`
- Test: `lib/native/__tests__/platform.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NativePlatform = "ios" | "android";
  export interface NativeInfo { isNative: boolean; platform?: NativePlatform; appVersion?: string }
  export const WEB_INFO: NativeInfo;
  export function parseNativeUserAgent(ua: string | null | undefined): NativeInfo;
  export interface ResolveNativeInput { capacitorPlatform: string; override?: string | null; allowOverride: boolean }
  export function resolveNativeInfo(input: ResolveNativeInput): NativeInfo;
  // lib/native/server.ts
  export async function getNativeInfo(): Promise<NativeInfo>;
  ```
  Later plans (2, 4) read `getNativeInfo()` in the billing page, sign-in page, and checkout route, and extend `resolveNativeInfo` with the real app version from Capacitor's App plugin.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/native/__tests__/platform.test.ts
import { describe, it, expect } from "vitest";
import { parseNativeUserAgent, resolveNativeInfo, WEB_INFO } from "../platform";

describe("parseNativeUserAgent", () => {
  it("returns web info for a normal browser UA", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
    expect(parseNativeUserAgent(ua)).toEqual(WEB_INFO);
  });

  it("returns web info for null or empty", () => {
    expect(parseNativeUserAgent(null)).toEqual(WEB_INFO);
    expect(parseNativeUserAgent("")).toEqual(WEB_INFO);
    expect(parseNativeUserAgent(undefined)).toEqual(WEB_INFO);
  });

  it("detects the iOS shell and its version", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 InmotusApp/1.2.0 (ios)";
    expect(parseNativeUserAgent(ua)).toEqual({ isNative: true, platform: "ios", appVersion: "1.2.0" });
  });

  it("detects the Android shell case-insensitively", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 inmotusapp/2.0.1 (ANDROID)";
    expect(parseNativeUserAgent(ua)).toEqual({ isNative: true, platform: "android", appVersion: "2.0.1" });
  });

  it("ignores a malformed marker", () => {
    expect(parseNativeUserAgent("Foo InmotusApp/1.2 (ios)")).toEqual(WEB_INFO);
    expect(parseNativeUserAgent("Foo InmotusApp/1.2.0 (windows)")).toEqual(WEB_INFO);
  });
});

describe("resolveNativeInfo", () => {
  it("trusts the Capacitor runtime platform first", () => {
    expect(resolveNativeInfo({ capacitorPlatform: "ios", allowOverride: false })).toEqual({ isNative: true, platform: "ios" });
    expect(resolveNativeInfo({ capacitorPlatform: "android", override: "off", allowOverride: true })).toEqual({ isNative: true, platform: "android" });
  });

  it("honors a dev override on web when allowed", () => {
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: "ios", allowOverride: true }))
      .toEqual({ isNative: true, platform: "ios", appVersion: "0.0.0-debug" });
  });

  it("ignores the override when not allowed or invalid", () => {
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: "ios", allowOverride: false })).toEqual(WEB_INFO);
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: "windows", allowOverride: true })).toEqual(WEB_INFO);
    expect(resolveNativeInfo({ capacitorPlatform: "web", override: null, allowOverride: true })).toEqual(WEB_INFO);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/native/__tests__/platform.test.ts`
Expected: FAIL with "Failed to resolve import '../platform'".

- [ ] **Step 3: Write the pure module**

```ts
// lib/native/platform.ts
/**
 * Native shell detection (spec §4). Pure module: safe to import from server
 * components, client components, and tests. No Next.js or DOM imports.
 */

export type NativePlatform = "ios" | "android";

export interface NativeInfo {
  /** True when the page runs inside the Capacitor shell (or a dev override). */
  isNative: boolean;
  platform?: NativePlatform;
  /** Shell version from the UA marker, e.g. "1.2.0". Undefined on web. */
  appVersion?: string;
}

export const WEB_INFO: NativeInfo = { isNative: false };

// Appended by the shell via capacitor.config.ts `appendUserAgent`:
//   InmotusApp/1.2.0 (ios)
const UA_MARKER = /InmotusApp\/(\d+\.\d+\.\d+)\s*\((ios|android)\)/i;

export function parseNativeUserAgent(ua: string | null | undefined): NativeInfo {
  if (!ua) return WEB_INFO;
  const match = UA_MARKER.exec(ua);
  if (!match) return WEB_INFO;
  return {
    isNative: true,
    platform: match[2].toLowerCase() as NativePlatform,
    appVersion: match[1],
  };
}

export interface ResolveNativeInput {
  /** `Capacitor.getPlatform()`: "ios" | "android" | "web". */
  capacitorPlatform: string;
  /** `?native=` query value or stored override. "off" clears it. */
  override?: string | null;
  /** Only dev builds (or NEXT_PUBLIC_NATIVE_DEBUG=1) may honor the override. */
  allowOverride: boolean;
}

/** Client-side resolution: runtime platform wins; dev override is a fallback. */
export function resolveNativeInfo(input: ResolveNativeInput): NativeInfo {
  if (input.capacitorPlatform === "ios" || input.capacitorPlatform === "android") {
    return { isNative: true, platform: input.capacitorPlatform };
  }
  if (input.allowOverride && input.override) {
    const value = input.override.toLowerCase();
    if (value === "ios" || value === "android") {
      return { isNative: true, platform: value, appVersion: "0.0.0-debug" };
    }
  }
  return WEB_INFO;
}
```

```ts
// lib/native/server.ts
import { headers } from "next/headers";
import { parseNativeUserAgent, type NativeInfo } from "./platform";

/**
 * Server-side native detection from the request user agent. Only call this
 * from routes that are already dynamic (they use auth() or headers()); it
 * forces dynamic rendering wherever it is used.
 */
export async function getNativeInfo(): Promise<NativeInfo> {
  const requestHeaders = await headers();
  return parseNativeUserAgent(requestHeaders.get("user-agent"));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/native/__tests__/platform.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add lib/native && git commit -m "feat: detect the native mobile shell from the request user agent"
```

---

### Task 2: NativeProvider, `useNative()`, root layout, native CSS

**Files:**
- Create: `components/providers/native-provider.tsx`
- Create: `hooks/use-native.ts`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (append after the `@layer base` block, around line 230)
- Test: `components/providers/__tests__/native-provider.test.tsx`

**Interfaces:**
- Consumes: `resolveNativeInfo`, `WEB_INFO`, `NativeInfo` from `lib/native/platform.ts`.
- Produces:
  ```ts
  export interface NativeContextValue extends NativeInfo { isOnline: boolean }
  export function NativeProvider({ children }: { children: React.ReactNode }): JSX.Element;
  export function useNative(): NativeContextValue;
  export const NATIVE_OVERRIDE_KEY = "inmotus:native-override";
  ```
  Plans 2–4 add Capacitor plugin listeners (splash hide, back button, app state, push events, deep links) inside this provider's effects.

- [ ] **Step 1: Install the Capacitor core package at the repo root**

Run: `npm install @capacitor/core@latest`
Expected: `package.json` dependencies gains `@capacitor/core`. It no-ops on web (`Capacitor.getPlatform()` returns `"web"`).

- [ ] **Step 2: Write the failing test**

```tsx
// components/providers/__tests__/native-provider.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NativeProvider, useNative } from "../native-provider";

function Probe() {
  const { isNative, platform, isOnline } = useNative();
  return <span data-native={String(isNative)} data-platform={platform ?? "web"} data-online={String(isOnline)} />;
}

describe("NativeProvider", () => {
  it("renders as web and online on the server pass", () => {
    const html = renderToStaticMarkup(
      <NativeProvider>
        <Probe />
      </NativeProvider>
    );
    expect(html).toContain('data-native="false"');
    expect(html).toContain('data-platform="web"');
    expect(html).toContain('data-online="true"');
  });

  it("defaults to web when used without a provider", () => {
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('data-native="false"');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run components/providers/__tests__/native-provider.test.tsx`
Expected: FAIL, cannot resolve `../native-provider`.

- [ ] **Step 4: Write the provider and hook**

```tsx
// components/providers/native-provider.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { resolveNativeInfo, WEB_INFO, type NativeInfo } from "@/lib/native/platform";

export interface NativeContextValue extends NativeInfo {
  /** Browser connectivity. Plan 2 replaces the source with @capacitor/network on native. */
  isOnline: boolean;
}

export const NATIVE_OVERRIDE_KEY = "inmotus:native-override";

const NativeContext = createContext<NativeContextValue>({ ...WEB_INFO, isOnline: true });

const ALLOW_OVERRIDE =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_NATIVE_DEBUG === "1";

/** `?native=ios|android` sets a persistent override; `?native=off` clears it. */
function readOverride(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("native");
    if (fromQuery === "off") {
      window.localStorage.removeItem(NATIVE_OVERRIDE_KEY);
      return null;
    }
    if (fromQuery) {
      window.localStorage.setItem(NATIVE_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    return window.localStorage.getItem(NATIVE_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

function applyDocumentFlags(info: NativeInfo) {
  const html = document.documentElement;
  html.toggleAttribute("data-native", info.isNative);
  if (info.platform) html.setAttribute("data-platform", info.platform);
  else html.removeAttribute("data-platform");

  // iOS zooms the page when an input is focused unless maximum-scale is set.
  // Only do this inside the shell so desktop and mobile web keep pinch-zoom.
  if (info.isNative) {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const content = meta?.getAttribute("content") ?? "";
    if (meta && !content.includes("maximum-scale")) {
      meta.setAttribute("content", `${content}, maximum-scale=1`);
    }
  }
}

export function NativeProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render are always "web" so hydration matches.
  const [info, setInfo] = useState<NativeInfo>(WEB_INFO);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const resolved = resolveNativeInfo({
      capacitorPlatform: Capacitor.getPlatform(),
      override: readOverride(),
      allowOverride: ALLOW_OVERRIDE,
    });
    setInfo(resolved);
    applyDocumentFlags(resolved);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return <NativeContext.Provider value={{ ...info, isOnline }}>{children}</NativeContext.Provider>;
}

export function useNative(): NativeContextValue {
  return useContext(NativeContext);
}
```

```ts
// hooks/use-native.ts
export { useNative } from "@/components/providers/native-provider";
export type { NativeContextValue } from "@/components/providers/native-provider";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/providers/__tests__/native-provider.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Mount the provider and export the viewport in the root layout**

Edit `app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter, Lexend } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastProvider } from "@/components/providers/toast-provider";
import { NativeProvider } from "@/components/providers/native-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClipboardProvider } from "@/lib/clipboard-context";
import "./globals.css";
```

Add below `metadata`:

```tsx
// viewport-fit=cover lets the page extend under the iOS notch and home
// indicator so header and tab bar can pad with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
```

Wrap the tree:

```tsx
          <NativeProvider>
            <TooltipProvider>
              <ClipboardProvider>
                {children}
                <ToastProvider />
              </ClipboardProvider>
            </TooltipProvider>
          </NativeProvider>
```

- [ ] **Step 7: Add safe-area variables and native-only CSS**

Append to `app/globals.css` after the `.page-enter` rule:

```css
/* ── Mobile shell (spec §5) ──────────────────────────────────────────────
   Safe-area insets are 0 on desktop and mobile web; they only take effect
   inside the native shell where the status bar overlays the web view. */
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --tab-bar-height: 3.5rem;
}

/* Set by NativeProvider when running inside the Capacitor shell. */
html[data-native] {
  -webkit-touch-callout: none;
}
html[data-native] body {
  overscroll-behavior: none;
}
/* iOS zooms into inputs smaller than 16px on focus. */
html[data-native] input,
html[data-native] select,
html[data-native] textarea {
  font-size: max(1rem, 1em);
}
html[data-native] header,
html[data-native] [data-slot="mobile-tab-bar"] {
  -webkit-user-select: none;
  user-select: none;
}
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint app/layout.tsx components/providers hooks lib/native`
Expected: no errors.

- [ ] **Step 9: Manual check of the dev override**

Run: `npm run dev`, open `http://localhost:3000/dashboard?native=ios`, sign in, then in DevTools console run `document.documentElement.getAttribute("data-platform")`.
Expected: `"ios"`. Open `http://localhost:3000/dashboard?native=off`; the attribute is gone.

- [ ] **Step 10: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add package.json package-lock.json app/layout.tsx app/globals.css components/providers hooks && git commit -m "feat: add NativeProvider, useNative hook and safe-area CSS"
```

---

### Task 3: Extract navigation items with phone tiers

**Files:**
- Create: `components/layout/nav-items.ts`
- Modify: `components/layout/sidebar.tsx` (lines 1–71 imports and arrays; lines 78–96 active-match logic)
- Test: `components/layout/__tests__/nav-items.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Role = "TRAINER" | "CLIENT";
  export type PhoneTier = 1 | 2 | 3;
  export interface NavItem { href: string; label: string; tabLabel?: string; icon: LucideIcon; tier: PhoneTier }
  export const TRAINER_NAV: NavItem[]; export const CLIENT_NAV: NavItem[];
  export const TRAINER_ACCOUNT_NAV: NavItem[]; export const CLIENT_ACCOUNT_NAV: NavItem[];
  export const ADMIN_NAV: NavItem;
  export function getPrimaryNav(role: Role): NavItem[];
  export function getAccountNav(role: Role): NavItem[];
  export interface TabLayout { tabs: NavItem[]; more: NavItem[] }
  export function getTabLayout(role: Role): TabLayout;
  export function findActiveHref(pathname: string, hrefs: string[]): string | undefined;
  ```
  Plan 1b reads `tier` to label desktop-only tools; Plan 4 filters `/settings/billing` out on native.

- [ ] **Step 1: Write the failing tests**

```ts
// components/layout/__tests__/nav-items.test.ts
import { describe, it, expect } from "vitest";
import { findActiveHref, getAccountNav, getPrimaryNav, getTabLayout } from "../nav-items";

describe("getTabLayout", () => {
  it("gives clients five tabs and nothing under More", () => {
    const { tabs, more } = getTabLayout("CLIENT");
    expect(tabs.map((t) => t.href)).toEqual(["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"]);
    expect(more).toEqual([]);
  });

  it("gives trainers four tabs plus the rest under More", () => {
    const { tabs, more } = getTabLayout("TRAINER");
    expect(tabs.map((t) => t.href)).toEqual(["/dashboard", "/clients", "/programs", "/messages"]);
    expect(more.map((m) => m.href)).toEqual(["/exercises", "/nutrition", "/analytics"]);
  });

  it("uses tabLabel when the sidebar label is too long", () => {
    const programs = getTabLayout("CLIENT").tabs.find((t) => t.href === "/programs");
    expect(programs?.label).toBe("My Programs");
    expect(programs?.tabLabel).toBe("Programs");
  });

  it("assigns a phone tier to every item", () => {
    for (const item of [...getPrimaryNav("TRAINER"), ...getPrimaryNav("CLIENT"), ...getAccountNav("TRAINER")]) {
      expect([1, 2, 3]).toContain(item.tier);
    }
  });
});

describe("findActiveHref", () => {
  const hrefs = ["/settings", "/settings/billing", "/clients", "/dashboard"];

  it("matches an exact path", () => {
    expect(findActiveHref("/clients", hrefs)).toBe("/clients");
  });

  it("matches the longest prefix for nested paths", () => {
    expect(findActiveHref("/settings/billing/history", hrefs)).toBe("/settings/billing");
    expect(findActiveHref("/settings/clinic", hrefs)).toBe("/settings");
  });

  it("does not match a sibling that merely shares a prefix string", () => {
    expect(findActiveHref("/clientsarchive", hrefs)).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(findActiveHref("/nowhere", hrefs)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/layout/__tests__/nav-items.test.ts`
Expected: FAIL, cannot resolve `../nav-items`.

- [ ] **Step 3: Write `nav-items.ts`**

```ts
// components/layout/nav-items.ts
import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Dumbbell,
  History,
  Inbox,
  LayoutDashboard,
  Library,
  Settings,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";

export type Role = "TRAINER" | "CLIENT";

/**
 * Phone support tier from the mobile spec §5a.
 * 1 = phone-first (redesigned), 2 = phone-usable (view & light edit),
 * 3 = desktop-only (read-only view + notice on phones).
 */
export type PhoneTier = 1 | 2 | 3;

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the bottom tab bar; falls back to `label`. */
  tabLabel?: string;
  icon: LucideIcon;
  tier: PhoneTier;
}

export const TRAINER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tier: 1 },
  { href: "/clients", label: "Clients", icon: Users, tier: 1 },
  { href: "/programs", label: "Programs", icon: Library, tier: 2 },
  { href: "/exercises", label: "Exercises", icon: Dumbbell, tier: 2 },
  { href: "/nutrition", label: "Nutrition", icon: Apple, tier: 2 },
  { href: "/messages", label: "Inbox", icon: Inbox, tier: 1 },
  { href: "/analytics", label: "Analytics", icon: TrendingUp, tier: 2 },
];

export const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tier: 1 },
  { href: "/programs", label: "My Programs", tabLabel: "Programs", icon: ClipboardList, tier: 1 },
  // The month calendar moved off the dashboard onto its own page, so it needs
  // a nav entry of its own to stay discoverable.
  { href: "/calendar", label: "Calendar", icon: CalendarDays, tier: 1 },
  { href: "/nutrition", label: "Nutrition", icon: Apple, tier: 1 },
  { href: "/messages", label: "Inbox", icon: Inbox, tier: 1 },
];

export const TRAINER_ACCOUNT_NAV: NavItem[] = [
  { href: "/settings/billing", label: "Billing", icon: CreditCard, tier: 3 },
  { href: "/settings", label: "Settings", icon: Settings, tier: 2 },
  { href: "/settings/clinic", label: "Organization", icon: Building2, tier: 3 },
  { href: "/settings/audit-log", label: "Audit Log", icon: History, tier: 3 },
];

export const CLIENT_ACCOUNT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, tier: 2 },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Super Admin", icon: Shield, tier: 3 };

const TRAINER_TAB_HREFS = ["/dashboard", "/clients", "/programs", "/messages"];
const CLIENT_TAB_HREFS = ["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"];

export function getPrimaryNav(role: Role): NavItem[] {
  return role === "TRAINER" ? TRAINER_NAV : CLIENT_NAV;
}

export function getAccountNav(role: Role): NavItem[] {
  return role === "TRAINER" ? TRAINER_ACCOUNT_NAV : CLIENT_ACCOUNT_NAV;
}

export interface TabLayout {
  /** Items rendered as bottom tabs, in order. */
  tabs: NavItem[];
  /** Primary items that did not fit; shown in the "More" sheet. Empty → no More tab. */
  more: NavItem[];
}

export function getTabLayout(role: Role): TabLayout {
  const nav = getPrimaryNav(role);
  const tabHrefs = role === "TRAINER" ? TRAINER_TAB_HREFS : CLIENT_TAB_HREFS;
  const tabs = tabHrefs
    .map((href) => nav.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const more = nav.filter((item) => !tabHrefs.includes(item.href));
  return { tabs, more };
}

/**
 * The active link is whichever registered href is the longest prefix of the
 * current pathname — "most specific wins" prevents /settings lighting up on
 * /settings/billing. Prefix matches must end at a path boundary.
 */
export function findActiveHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/layout/__tests__/nav-items.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Make the sidebar consume `nav-items.ts`**

In `components/layout/sidebar.tsx`:

1. Replace the lucide import block with only the icons still used directly:
   ```tsx
   import { Settings, Activity, Shield, CreditCard, History, Building2 } from "lucide-react";
   import { findActiveHref, getAccountNav, getPrimaryNav } from "./nav-items";
   ```
2. Delete the `NavLink` interface and the `trainerLinks` / `clientLinks` arrays (lines 42–71).
3. Replace the body's first lines:
   ```tsx
   const pathname = usePathname();
   const links = getPrimaryNav(role);

   // Collect every href rendered in this sidebar so we can find the best match.
   const allHrefs = [...links.map((l) => l.href), ...getAccountNav(role).map((l) => l.href)];
   const bestMatch = findActiveHref(pathname, allHrefs);
   ```
   and delete the old `accountHrefs` and inline `bestMatch` computation.
4. Leave the JSX unchanged. `link.icon` is now a `LucideIcon`, which satisfies `React.ElementType`.

- [ ] **Step 6: Verify nothing changed visually and types pass**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components/layout && npx vitest run components/layout`
Expected: no errors; existing breadcrumb tests still pass.

Run `npm run dev`, open `/dashboard` as a trainer and a client at desktop width.
Expected: sidebar links, order, badges and active state identical to before.

- [ ] **Step 7: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add components/layout && git commit -m "refactor: extract sidebar navigation into shared nav-items with phone tiers"
```

---

### Task 4: Bottom tab bar, More sheet, safe-area chrome

**Files:**
- Create: `components/layout/mobile-tab-bar.tsx`
- Modify: `components/layout/header.tsx:33` (header element)
- Modify: `app/(platform)/layout.tsx:83-93` (main + mount)
- Test: `components/layout/__tests__/mobile-tab-bar.test.tsx`

**Interfaces:**
- Consumes: `getTabLayout`, `getAccountNav`, `ADMIN_NAV`, `findActiveHref`, `NavItem`, `Role` from `nav-items.ts`; `Sheet`, `SheetContent`, `SheetTitle` from `components/ui/sheet`; `Badge` from `components/ui/badge`.
- Produces:
  ```tsx
  interface MobileTabBarProps { role: Role; unreadMessageCount: number; isAdmin?: boolean }
  export function MobileTabBar(props: MobileTabBarProps): JSX.Element;
  ```
  Root element has `data-slot="mobile-tab-bar"` (used by the native CSS from Task 2 and by Plan 4 to hide Billing on native).

- [ ] **Step 1: Write the failing test**

```tsx
// components/layout/__tests__/mobile-tab-bar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/abc123" }));

import { MobileTabBar } from "../mobile-tab-bar";

describe("MobileTabBar", () => {
  it("renders five client tabs and no More button", () => {
    const html = renderToStaticMarkup(<MobileTabBar role="CLIENT" unreadMessageCount={0} />);
    expect(html).toContain('data-slot="mobile-tab-bar"');
    for (const href of ["/dashboard", "/programs", "/calendar", "/nutrition", "/messages"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain(">Programs<");
    expect(html).not.toContain(">More<");
  });

  it("renders four trainer tabs plus More, and marks Clients active on a nested path", () => {
    const html = renderToStaticMarkup(<MobileTabBar role="TRAINER" unreadMessageCount={0} />);
    expect(html).toContain(">More<");
    expect(html).toMatch(/<a[^>]*href="\/clients"[^>]*aria-current="page"/);
    expect(html).not.toContain('href="/exercises"'); // lives in the closed More sheet
  });

  it("shows the unread badge on Inbox, capped at 99+", () => {
    expect(renderToStaticMarkup(<MobileTabBar role="CLIENT" unreadMessageCount={3} />)).toContain(">3<");
    expect(renderToStaticMarkup(<MobileTabBar role="CLIENT" unreadMessageCount={250} />)).toContain(">99+<");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/layout/__tests__/mobile-tab-bar.test.tsx`
Expected: FAIL, cannot resolve `../mobile-tab-bar`.

- [ ] **Step 3: Write the tab bar**

```tsx
// components/layout/mobile-tab-bar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ADMIN_NAV,
  findActiveHref,
  getAccountNav,
  getTabLayout,
  type NavItem,
  type Role,
} from "./nav-items";

interface MobileTabBarProps {
  role: Role;
  /** Unread chat messages plus unread workout voice notes — one combined badge. */
  unreadMessageCount: number;
  isAdmin?: boolean;
}

const tabClass =
  "flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors";

/**
 * Primary navigation for phones (spec §5). Visible below the `lg` breakpoint
 * on both mobile web and the native shell. The header's menu button keeps
 * secondary navigation (Settings, Organization, Billing, Admin).
 */
export function MobileTabBar({ role, unreadMessageCount, isAdmin = false }: MobileTabBarProps) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);

  const { tabs, more } = getTabLayout(role);
  const moreItems: NavItem[] = [...more, ...getAccountNav(role), ...(isAdmin ? [ADMIN_NAV] : [])];
  const hasMore = more.length > 0;

  const active = findActiveHref(pathname, [...tabs, ...moreItems].map((i) => i.href));
  const moreIsActive = hasMore && moreItems.some((item) => item.href === active);
  const columns = tabs.length + (hasMore ? 1 : 0);

  const inboxBadge = (href: string) =>
    href === "/messages" && unreadMessageCount > 0 ? (
      <Badge
        variant="destructive"
        className="absolute right-1/2 top-1 h-4 min-w-4 translate-x-4 justify-center px-1 text-[10px] font-bold"
      >
        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
      </Badge>
    ) : null;

  return (
    <>
      <nav
        data-slot="mobile-tab-bar"
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <ul
          className="grid h-[var(--tab-bar-height)]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.href === active;
            return (
              <li key={tab.href} className="relative">
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(tabClass, isActive ? "text-primary" : "text-muted-foreground")}
                >
                  <Icon className="size-5" aria-hidden />
                  <span>{tab.tabLabel ?? tab.label}</span>
                  {inboxBadge(tab.href)}
                </Link>
              </li>
            );
          })}
          {hasMore && (
            <li className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className={cn(tabClass, moreIsActive ? "text-primary" : "text-muted-foreground")}
              >
                <MoreHorizontal className="size-5" aria-hidden />
                <span>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {hasMore && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem_+_var(--safe-bottom))]">
            <SheetTitle className="px-4 pt-4 text-sm font-semibold text-muted-foreground">More</SheetTitle>
            <ul className="grid grid-cols-3 gap-2 px-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-xs font-medium",
                        item.href === active ? "border-primary/40 text-primary" : "text-foreground"
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/layout/__tests__/mobile-tab-bar.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Mount the tab bar and pad the main area**

In `app/(platform)/layout.tsx`, add the import:

```tsx
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
```

Replace the `<main>` block and add the tab bar right after it, inside the same flex column:

```tsx
            <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_var(--tab-bar-height)_+_var(--safe-bottom))] sm:p-6 sm:pb-[calc(1.5rem_+_var(--tab-bar-height)_+_var(--safe-bottom))] lg:pb-6">
              <div className="page-enter">{children}</div>
            </main>
            <MobileTabBar
              role={user.role}
              unreadMessageCount={unreadMessageCount}
              isAdmin={adminAccess}
            />
```

- [ ] **Step 6: Pad the header for the status bar**

In `components/layout/header.tsx`, change the `<header>` opening tag to:

```tsx
    <header
      className="flex min-h-16 items-center gap-4 border-b border-border bg-card px-4 sm:px-6"
      style={{ paddingTop: "var(--safe-top)" }}
    >
```

`--safe-top` is `0px` outside the shell, so web layout is unchanged.

- [ ] **Step 7: Type-check, lint, and check in the browser**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components/layout "app/(platform)/layout.tsx"`
Expected: no errors.

Run `npm run dev`. In Chrome DevTools device mode at 390×844:
- Client: five tabs, Inbox badge when unread, active tab highlighted, page content not hidden behind the bar when scrolled to the bottom.
- Trainer: four tabs plus More; tapping More opens a bottom sheet with Exercises, Nutrition, Analytics, Billing, Settings, Organization, Audit Log (and Super Admin for an admin); tapping an item navigates and closes the sheet.
- Desktop width ≥1024px: no tab bar, sidebar as before.

- [ ] **Step 8: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add components/layout "app/(platform)/layout.tsx" && git commit -m "feat: add bottom tab bar and safe-area chrome for phones"
```

---

### Task 5: Public legal pages

**Files:**
- Create: `lib/legal/company.ts`, `lib/legal/privacy-policy.ts`, `lib/legal/terms-of-service.ts`
- Create: `components/legal/legal-document.tsx`
- Create: `app/privacy/page.tsx`, `app/terms/page.tsx`
- Modify: `components/layout/site-footer.tsx:22-28` (Legal column)
- Modify: `proxy.ts:3-15` (public routes)
- Test: `components/legal/__tests__/legal-document.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface LegalSection { heading: string; paragraphs: string[]; bullets?: string[] }
  export interface LegalDocumentData { title: string; lastUpdated: string; intro: string; sections: LegalSection[] }
  export const PRIVACY_POLICY: LegalDocumentData; export const TERMS_OF_SERVICE: LegalDocumentData;
  export function LegalDocument({ doc }: { doc: LegalDocumentData }): JSX.Element;
  ```
  Plan 5 lists `https://app.goinmotus.com/privacy` and `/terms` in both store consoles. Task 8 links to them from Settings.

> **Owner input required before release:** the three values in `lib/legal/company.ts` (legal entity name, contact email, governing law) and a legal review of the draft wording. The draft is structured around what the app actually collects; it is not legal advice.

- [ ] **Step 1: Write the failing test**

```tsx
// components/legal/__tests__/legal-document.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LegalDocument } from "../legal-document";
import { PRIVACY_POLICY } from "@/lib/legal/privacy-policy";
import { TERMS_OF_SERVICE } from "@/lib/legal/terms-of-service";

describe("LegalDocument", () => {
  it("renders the title, last-updated date, and every section heading", () => {
    const html = renderToStaticMarkup(<LegalDocument doc={PRIVACY_POLICY} />);
    expect(html).toContain("Privacy Policy");
    expect(html).toContain(PRIVACY_POLICY.lastUpdated);
    for (const section of PRIVACY_POLICY.sections) {
      expect(html).toContain(section.heading);
    }
  });

  it("renders terms with a health disclaimer section", () => {
    const html = renderToStaticMarkup(<LegalDocument doc={TERMS_OF_SERVICE} />);
    expect(html).toContain("Terms of Service");
    expect(TERMS_OF_SERVICE.sections.some((s) => /not medical advice/i.test(s.paragraphs.join(" ")))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/legal/__tests__/legal-document.test.tsx`
Expected: FAIL, cannot resolve modules.

- [ ] **Step 3: Write the company constants and the two documents**

```ts
// lib/legal/company.ts
/**
 * Values referenced by the privacy policy and terms. Confirm all three with
 * the business owner before the first store submission.
 */
export const LEGAL_ENTITY_NAME = "Inmotus RX";
export const LEGAL_CONTACT_EMAIL = "support@goinmotus.com";
export const LEGAL_GOVERNING_LAW = "the laws of the State of Texas, United States";
export const LEGAL_SITE_URL = "https://app.goinmotus.com";
```

```ts
// lib/legal/privacy-policy.ts
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY_NAME } from "./company";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocumentData {
  title: string;
  /** Human-readable date shown under the title. */
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocumentData = {
  title: "Privacy Policy",
  lastUpdated: "September 21, 2026",
  intro: `${LEGAL_ENTITY_NAME} ("we", "us") provides a platform where fitness and rehabilitation professionals ("Trainers") build exercise programs and coach the people they work with ("Clients"). This policy explains what we collect, why, and the choices you have. It applies to our website, web app, and mobile apps.`,
  sections: [
    {
      heading: "Information we collect",
      paragraphs: ["We collect information you give us, information generated as you use the service, and limited technical data from your device."],
      bullets: [
        "Account details: name, email address, phone number, profile photo, and your role (Trainer or Client).",
        "Health and fitness information: goals, limitations, injuries, pain scores, body metrics, progress photos, workout logs, check-in answers, nutrition logs, and notes your Trainer records about you.",
        "Communications: messages and voice notes exchanged between Trainers and Clients.",
        "Device and usage data: device type, operating system, app version, push notification tokens, IP address, and pages or features used.",
        "Payment information for Trainers is processed by Stripe; we store subscription status but never full card numbers.",
      ],
    },
    {
      heading: "How we use information",
      paragraphs: ["We use your information to run the service and improve it. We do not sell personal information."],
      bullets: [
        "To create and deliver exercise programs, track adherence, and let Trainers and Clients communicate.",
        "To generate program suggestions and summaries using artificial-intelligence services acting on our behalf.",
        "To send notifications you have opted into, such as workout reminders and new-message alerts.",
        "To secure accounts, prevent abuse, and meet legal obligations.",
      ],
    },
    {
      heading: "Who can see your information",
      paragraphs: [
        "If you are a Client, the Trainers in your organization can see the health and fitness information you share and your activity in the app. If you are a Trainer, your Clients can see the programs, messages, and notes you share with them.",
        "We use service providers that process data on our behalf under contract, including cloud hosting and databases, authentication, payment processing, file storage, real-time messaging, email delivery, push notification delivery, and AI model providers. They may only use your data to provide services to us.",
        "We disclose information when required by law, to protect the rights and safety of users, or as part of a merger or acquisition with notice to you.",
      ],
    },
    {
      heading: "Retention and deletion",
      paragraphs: [
        "We keep your information while your account is active. You can delete your account at any time from Settings in the web or mobile app. Deletion removes your profile, health and fitness records, messages, and notification devices. Trainers must first deactivate or transfer their active Clients.",
        "Some records may be retained where required for legal, billing, or security purposes, and then deleted.",
      ],
    },
    {
      heading: "Your choices and rights",
      paragraphs: ["Depending on where you live, you may have rights to access, correct, export, or delete your information, and to object to certain processing."],
      bullets: [
        "Update your profile and notification preferences in Settings.",
        "Turn off push notifications in Settings or in your device settings.",
        `Contact us at ${LEGAL_CONTACT_EMAIL} to exercise any right not available in the app.`,
      ],
    },
    {
      heading: "Children",
      paragraphs: ["The service is not directed to children under 16, and we do not knowingly collect their information. If you believe a child has provided us information, contact us and we will delete it."],
    },
    {
      heading: "Security",
      paragraphs: ["We use encryption in transit, access controls, and audit logging to protect your information. No system is perfectly secure; keep your password private and tell us immediately if you suspect unauthorized access."],
    },
    {
      heading: "Changes to this policy",
      paragraphs: ["We will post any changes on this page and update the date above. Material changes will be announced in the app or by email."],
    },
    {
      heading: "Contact",
      paragraphs: [`Questions about this policy: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};
```

```ts
// lib/legal/terms-of-service.ts
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY_NAME, LEGAL_GOVERNING_LAW } from "./company";
import type { LegalDocumentData } from "./privacy-policy";

export const TERMS_OF_SERVICE: LegalDocumentData = {
  title: "Terms of Service",
  lastUpdated: "September 21, 2026",
  intro: `These terms govern your use of ${LEGAL_ENTITY_NAME} on the web and in our mobile apps. By creating an account you agree to them.`,
  sections: [
    {
      heading: "Accounts and roles",
      paragraphs: [
        "Trainers create organizations and invite Clients. Trainers are responsible for the accuracy of the programs, notes, and advice they provide. Clients are responsible for the accuracy of the information they share and for following their own healthcare provider's guidance.",
        "You must be at least 16 years old and provide accurate information. Keep your credentials confidential and notify us of any unauthorized use.",
      ],
    },
    {
      heading: "Not medical advice",
      paragraphs: [
        "The service provides tools for exercise programming and coaching. Content in the app, including AI-generated suggestions, is not medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional before starting or changing an exercise program, and stop any activity that causes pain or discomfort.",
        "You use the service at your own risk. Exercise carries inherent risks of injury.",
      ],
    },
    {
      heading: "Subscriptions and payments",
      paragraphs: [
        "Trainer subscriptions and any program purchases are sold and managed through our website. Prices, trial periods, and renewal terms are shown at checkout. You can cancel any time; access continues until the end of the paid period. Fees are non-refundable except where required by law.",
        "The mobile apps do not sell subscriptions or digital goods.",
      ],
    },
    {
      heading: "Acceptable use",
      paragraphs: ["You agree not to misuse the service."],
      bullets: [
        "Do not access another person's account or data without authorization.",
        "Do not upload unlawful, harmful, or infringing content.",
        "Do not attempt to reverse engineer, scrape, or disrupt the service.",
        "Do not use the service to provide care you are not qualified or licensed to provide.",
      ],
    },
    {
      heading: "Your content",
      paragraphs: ["You keep ownership of the content you upload. You grant us a license to store, process, and display it as needed to run the service, including sharing it with the Trainers or Clients you work with and processing it with AI services on your behalf."],
    },
    {
      heading: "Termination",
      paragraphs: ["You can delete your account at any time in Settings. We may suspend or terminate accounts that violate these terms or create risk for other users. Sections that by their nature should survive termination do so."],
    },
    {
      heading: "Disclaimers and limitation of liability",
      paragraphs: [
        `The service is provided "as is" without warranties of any kind. To the fullest extent permitted by law, ${LEGAL_ENTITY_NAME} is not liable for indirect, incidental, or consequential damages, or for injuries arising from exercise performed using the service. Our total liability is limited to the amount you paid us in the twelve months before the claim.`,
      ],
    },
    {
      heading: "Governing law",
      paragraphs: [`These terms are governed by ${LEGAL_GOVERNING_LAW}, without regard to conflict-of-law rules.`],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "We may update these terms; continued use after changes means you accept them. Material changes will be announced in the app or by email.",
        `Questions: ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};
```

- [ ] **Step 4: Write the document component and pages**

```tsx
// components/legal/legal-document.tsx
import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import type { LegalDocumentData } from "@/lib/legal/privacy-policy";

/** Public legal page shell. Uses semantic tokens only (no raw palette). */
export function LegalDocument({ doc }: { doc: LegalDocumentData }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar alwaysSolid />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {doc.lastUpdated}</p>
        <p className="mt-8 text-base leading-relaxed text-foreground">{doc.intro}</p>

        <div className="mt-10 space-y-10">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-foreground">{section.heading}</h2>
              {section.paragraphs.map((text, i) => (
                <p key={i} className="mt-3 leading-relaxed text-muted-foreground">
                  {text}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                  {section.bullets.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
```

`SiteNavbar` already declares `"use client"` at its top, so it can be rendered from this server component.

```tsx
// app/privacy/page.tsx
import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_POLICY } from "@/lib/legal/privacy-policy";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY_POLICY} />;
}
```

```tsx
// app/terms/page.tsx
import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_OF_SERVICE } from "@/lib/legal/terms-of-service";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalDocument doc={TERMS_OF_SERVICE} />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/legal/__tests__/legal-document.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Link the pages and make them public**

In `components/layout/site-footer.tsx`, replace the Legal column:

```ts
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
```

(The "HIPAA Compliance" link pointed at `#`; remove it here. The footer's separate "HIPAA Compliant · SOC 2 Type II" badge is a business claim the owner should confirm before store review, but changing it is outside this plan.)

In `proxy.ts`, add to `isPublicRoute`:

```ts
  "/privacy",
  "/terms",
  "/account-deleted",
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components/legal lib/legal app/privacy app/terms components/layout/site-footer.tsx proxy.ts`
Expected: no errors (in particular no `design/no-raw-palette` errors).

Run `npm run dev`, open `/privacy` and `/terms` in a signed-out window.
Expected: pages render without redirecting to sign-in; footer links work; phone width has no horizontal scroll.

- [ ] **Step 8: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add lib/legal components/legal app/privacy app/terms components/layout/site-footer.tsx proxy.ts && git commit -m "feat: add public privacy policy and terms pages"
```

---

### Task 6: Extract user deletion into a service

**Files:**
- Create: `lib/services/user-deletion.service.ts`
- Modify: `actions/admin-actions.ts:60-170` (`deleteUserAction`)
- Modify: `actions/__tests__/admin-actions.test.ts` (mocks and the three delete tests)
- Test: `lib/services/__tests__/user-deletion.service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DeletionBlockerCode = "PACKAGES" | "CLIENT_SUBSCRIPTIONS" | "LEGACY_PLANS" | "CHECKIN_TEMPLATES" | "ACTIVE_CLIENTS";
  export interface DeletionBlocker { code: DeletionBlockerCode; count: number; message: string }
  export async function findDeletionBlockers(userId: string, options: { includeActiveClients: boolean }): Promise<DeletionBlocker[]>;
  export async function deleteUserData(userId: string): Promise<void>;
  ```
  Task 7 calls both with `includeActiveClients: user.role === "TRAINER"`. Plan 3 adds `prisma.pushDevice.deleteMany` to `deleteUserData`.

Baseline: on `main`, `npx vitest run actions/__tests__/admin-actions.test.ts` reports 3 failures in `deleteUserAction` because the test mocks only `prisma.user` while the action calls `prisma.coachPackage.count` and friends. This task fixes that by mocking the new service.

- [ ] **Step 1: Write the failing service tests**

```ts
// lib/services/__tests__/user-deletion.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coachPackage: { count: vi.fn() },
    clientSubscription: { count: vi.fn() },
    workoutPlan: { count: vi.fn() },
    checkInTemplate: { count: vi.fn() },
    user: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn() },
    workoutSessionV2: { findMany: vi.fn(), deleteMany: vi.fn() },
    sessionExerciseLog: { findMany: vi.fn(), deleteMany: vi.fn() },
    workoutSession: { findMany: vi.fn(), deleteMany: vi.fn() },
    habitDefinition: { findMany: vi.fn(), deleteMany: vi.fn() },
    setLog: { deleteMany: vi.fn() },
    sessionFeedback: { deleteMany: vi.fn() },
    sessionExercise: { deleteMany: vi.fn() },
    exerciseFeedback: { deleteMany: vi.fn() },
    message: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    nutritionTarget: { deleteMany: vi.fn() },
    nutritionLog: { deleteMany: vi.fn() },
    nutritionWaterLog: { deleteMany: vi.fn() },
    nutritionAiSummary: { deleteMany: vi.fn() },
    nutritionComment: { deleteMany: vi.fn() },
    checkInResponse: { deleteMany: vi.fn() },
    checkInAssignment: { deleteMany: vi.fn() },
    bodyMetric: { deleteMany: vi.fn() },
    progressPhoto: { deleteMany: vi.fn() },
    habitLog: { deleteMany: vi.fn() },
    clinicalNote: { deleteMany: vi.fn() },
    coachBranding: { deleteMany: vi.fn() },
    trainerSubscription: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { findDeletionBlockers, deleteUserData } from "../user-deletion.service";

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  vi.clearAllMocks();
  p.coachPackage.count.mockResolvedValue(0);
  p.clientSubscription.count.mockResolvedValue(0);
  p.workoutPlan.count.mockResolvedValue(0);
  p.checkInTemplate.count.mockResolvedValue(0);
  p.workoutSessionV2.findMany.mockResolvedValue([]);
  p.sessionExerciseLog.findMany.mockResolvedValue([]);
  p.workoutSession.findMany.mockResolvedValue([]);
  p.habitDefinition.findMany.mockResolvedValue([]);
});

describe("findDeletionBlockers", () => {
  it("returns no blockers for a clean account", async () => {
    expect(await findDeletionBlockers("u1", { includeActiveClients: false })).toEqual([]);
  });

  it("reports structural rows other users depend on", async () => {
    p.coachPackage.count.mockResolvedValue(2);
    p.checkInTemplate.count.mockResolvedValue(1);
    const blockers = await findDeletionBlockers("u1", { includeActiveClients: false });
    expect(blockers.map((b) => b.code)).toEqual(["PACKAGES", "CHECKIN_TEMPLATES"]);
    expect(blockers[0].count).toBe(2);
    expect(blockers[0].message).toMatch(/2 coaching package/);
  });

  it("blocks a trainer who still has active clients when asked to", async () => {
    p.user.findUnique.mockResolvedValue({ role: "TRAINER", clerkOrgId: "org_1" });
    p.user.count.mockResolvedValue(3);
    const blockers = await findDeletionBlockers("u1", { includeActiveClients: true });
    expect(blockers).toEqual([expect.objectContaining({ code: "ACTIVE_CLIENTS", count: 3 })]);
    expect(p.user.count).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_1", role: "CLIENT", isActive: true },
    });
  });

  it("does not check active clients for a client account", async () => {
    p.user.findUnique.mockResolvedValue({ role: "CLIENT", clerkOrgId: "org_1" });
    expect(await findDeletionBlockers("u1", { includeActiveClients: true })).toEqual([]);
    expect(p.user.count).not.toHaveBeenCalled();
  });
});

describe("deleteUserData", () => {
  it("deletes leaf rows before the user row", async () => {
    p.workoutSessionV2.findMany.mockResolvedValue([{ id: "s1" }]);
    p.sessionExerciseLog.findMany.mockResolvedValue([{ id: "l1" }]);
    await deleteUserData("u1");
    expect(p.setLog.deleteMany).toHaveBeenCalledWith({ where: { sessionExerciseLogId: { in: ["l1"] } } });
    expect(p.message.deleteMany).toHaveBeenCalledWith({ where: { OR: [{ senderId: "u1" }, { recipientId: "u1" }] } });
    expect(p.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(p.setLog.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(p.user.delete.mock.invocationCallOrder[0]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/user-deletion.service.test.ts`
Expected: FAIL, cannot resolve `../user-deletion.service`.

- [ ] **Step 3: Write the service (moved verbatim from the admin action, plus the active-client check)**

```ts
// lib/services/user-deletion.service.ts
import { prisma } from "@/lib/prisma";

export type DeletionBlockerCode =
  | "PACKAGES"
  | "CLIENT_SUBSCRIPTIONS"
  | "LEGACY_PLANS"
  | "CHECKIN_TEMPLATES"
  | "ACTIVE_CLIENTS";

export interface DeletionBlocker {
  code: DeletionBlockerCode;
  count: number;
  /** Sentence fragment; callers prefix "Cannot delete: " or show as-is. */
  message: string;
}

/**
 * Rows another real user depends on as their own asset (a client's paid
 * subscription, a trainer's sellable package or check-in template, a legacy
 * plan that may still be assigned to a different client). We refuse with a
 * specific reason instead of silently deleting something a third party
 * relies on. `includeActiveClients` adds the self-serve rule from the mobile
 * spec §6: a trainer must deactivate or reassign clients before leaving.
 */
export async function findDeletionBlockers(
  userId: string,
  options: { includeActiveClients: boolean }
): Promise<DeletionBlocker[]> {
  const [packageCount, subscriptionCount, legacyPlanCount, checkInTemplateCount] = await Promise.all([
    prisma.coachPackage.count({ where: { trainerId: userId } }),
    prisma.clientSubscription.count({ where: { clientId: userId } }),
    prisma.workoutPlan.count({ where: { createdById: userId } }),
    prisma.checkInTemplate.count({ where: { trainerId: userId } }),
  ]);

  const blockers: DeletionBlocker[] = [];
  if (packageCount > 0) {
    blockers.push({ code: "PACKAGES", count: packageCount, message: `this trainer has ${packageCount} coaching package(s) for sale. Remove them first.` });
  }
  if (subscriptionCount > 0) {
    blockers.push({ code: "CLIENT_SUBSCRIPTIONS", count: subscriptionCount, message: `this client has ${subscriptionCount} billing subscription(s) on file. Cancel them first.` });
  }
  if (legacyPlanCount > 0) {
    blockers.push({ code: "LEGACY_PLANS", count: legacyPlanCount, message: `this trainer authored ${legacyPlanCount} legacy workout plan(s) that may still be assigned to other clients. Reassign or remove them first.` });
  }
  if (checkInTemplateCount > 0) {
    blockers.push({ code: "CHECKIN_TEMPLATES", count: checkInTemplateCount, message: `this trainer created ${checkInTemplateCount} check-in template(s) that may be assigned to other clients. Remove them first.` });
  }

  if (options.includeActiveClients) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, clerkOrgId: true } });
    if (user?.role === "TRAINER" && user.clerkOrgId) {
      const activeClients = await prisma.user.count({
        where: { clerkOrgId: user.clerkOrgId, role: "CLIENT", isActive: true },
      });
      if (activeClients > 0) {
        blockers.push({ code: "ACTIVE_CLIENTS", count: activeClients, message: `you still have ${activeClients} active client(s). Deactivate or reassign them before deleting your account.` });
      }
    }
  }

  return blockers;
}

/**
 * Hard-deletes a user and their personal data, leaf-first.
 *
 * Every relation back to User is required (non-nullable) and has no
 * `onDelete: Cascade` in the schema, so a bare `prisma.user.delete()` throws
 * a relation-violation the moment any one of them has a row.
 *
 * Sequential, not $transaction — this codebase has no prior use of
 * multi-document transactions, and MongoDB only supports them on a
 * replica-set deployment. Each step is independently idempotent (deleteMany
 * on an already-empty set is a no-op), so a mid-sequence failure just leaves
 * the retry with less left to clean up.
 *
 * Callers must run `findDeletionBlockers` first.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const v2SessionIds = (
    await prisma.workoutSessionV2.findMany({ where: { clientId: userId }, select: { id: true } })
  ).map((s) => s.id);
  const v2LogIds = v2SessionIds.length
    ? (await prisma.sessionExerciseLog.findMany({ where: { sessionId: { in: v2SessionIds } }, select: { id: true } })).map((l) => l.id)
    : [];
  const v1SessionIds = (
    await prisma.workoutSession.findMany({ where: { clientId: userId }, select: { id: true } })
  ).map((s) => s.id);
  const habitIds = (
    await prisma.habitDefinition.findMany({ where: { clientId: userId }, select: { id: true } })
  ).map((h) => h.id);

  if (v2LogIds.length) await prisma.setLog.deleteMany({ where: { sessionExerciseLogId: { in: v2LogIds } } });
  if (v2SessionIds.length) {
    await prisma.sessionExerciseLog.deleteMany({ where: { sessionId: { in: v2SessionIds } } });
    await prisma.sessionFeedback.deleteMany({ where: { sessionId: { in: v2SessionIds } } });
  }
  await prisma.workoutSessionV2.deleteMany({ where: { clientId: userId } });
  if (v1SessionIds.length) await prisma.sessionExercise.deleteMany({ where: { sessionId: { in: v1SessionIds } } });
  await prisma.workoutSession.deleteMany({ where: { clientId: userId } });
  await prisma.exerciseFeedback.deleteMany({ where: { clientId: userId } });
  await prisma.message.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.nutritionTarget.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionLog.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionWaterLog.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionAiSummary.deleteMany({ where: { clientId: userId } });
  await prisma.nutritionComment.deleteMany({ where: { OR: [{ clientId: userId }, { authorId: userId }] } });
  await prisma.checkInResponse.deleteMany({ where: { clientId: userId } });
  await prisma.checkInAssignment.deleteMany({ where: { clientId: userId } });
  await prisma.bodyMetric.deleteMany({ where: { clientId: userId } });
  await prisma.progressPhoto.deleteMany({ where: { clientId: userId } });
  if (habitIds.length) await prisma.habitLog.deleteMany({ where: { habitId: { in: habitIds } } });
  await prisma.habitDefinition.deleteMany({ where: { clientId: userId } });
  await prisma.clinicalNote.deleteMany({ where: { OR: [{ clientId: userId }, { trainerId: userId }] } });
  await prisma.coachBranding.deleteMany({ where: { trainerId: userId } });
  await prisma.trainerSubscription.deleteMany({ where: { trainerId: userId } });
  await prisma.user.delete({ where: { id: userId } });
}
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/user-deletion.service.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Make the admin action delegate**

In `actions/admin-actions.ts`, add the import:

```ts
import { findDeletionBlockers, deleteUserData } from "@/lib/services/user-deletion.service";
```

Replace the body of `deleteUserAction` from the `const [packageCount, …] = await Promise.all([` line through `await prisma.user.delete({ where: { id: userId } });` with:

```ts
    const blockers = await findDeletionBlockers(userId, { includeActiveClients: false });
    if (blockers.length > 0) {
      return { success: false as const, error: `Cannot delete: ${blockers[0].message}` };
    }

    await deleteUserData(userId);
```

Keep the `target` prefetch, the `logUserAction` call, `revalidatePath`, and the `catch` block exactly as they are. Delete the long explanatory comment about buckets and the sequential-deletion comment from the action; they now live in the service.

- [ ] **Step 6: Fix the admin tests to mock the service**

In `actions/__tests__/admin-actions.test.ts`, add after the existing `vi.mock` calls:

```ts
vi.mock('@/lib/services/user-deletion.service', () => ({
  findDeletionBlockers: vi.fn(),
  deleteUserData: vi.fn(),
}))
```

Add imports and mocked handles:

```ts
import { findDeletionBlockers, deleteUserData } from '@/lib/services/user-deletion.service'
const mockFindBlockers = vi.mocked(findDeletionBlockers)
const mockDeleteUserData = vi.mocked(deleteUserData)
```

In `beforeEach`, add:

```ts
  mockFindBlockers.mockResolvedValue([])
  mockDeleteUserData.mockResolvedValue(undefined)
```

In the `deleteUserAction` describe block, replace every `mockUserDelete` reference with `mockDeleteUserData`, so the assertions read:

```ts
    expect(mockDeleteUserData).toHaveBeenCalledWith('user_1')
    // …
    expect(mockDeleteUserData.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogAudit.mock.invocationCallOrder[0]
    )
```

For the test that expects `'Cannot delete: this user has existing data. Archive them…'` style failure, drive it through the blockers instead:

```ts
  it('refuses when the user owns rows other users depend on', async () => {
    mockFindBlockers.mockResolvedValue([
      { code: 'PACKAGES', count: 1, message: 'this trainer has 1 coaching package(s) for sale. Remove them first.' },
    ])
    const result = await deleteUserAction('user_1')
    expect(result).toEqual({
      success: false,
      error: 'Cannot delete: this trainer has 1 coaching package(s) for sale. Remove them first.',
    })
    expect(mockDeleteUserData).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
```

If the existing failing test instead asserts on a Prisma relation error, keep that case too by making `mockDeleteUserData.mockRejectedValue(Object.assign(new Error('rel'), { code: 'P2014' }))` and expecting the `"Cannot delete: this user has existing data that couldn't be fully cleared. Archive them instead."` message.

- [ ] **Step 7: Run both test files**

Run: `npx vitest run actions/__tests__/admin-actions.test.ts lib/services/__tests__/user-deletion.service.test.ts`
Expected: PASS, all tests (the 3 baseline failures are gone).

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint actions/admin-actions.ts lib/services/user-deletion.service.ts`
Expected: no errors.

- [ ] **Step 9: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add lib/services/user-deletion.service.ts lib/services/__tests__/user-deletion.service.test.ts actions/admin-actions.ts actions/__tests__/admin-actions.test.ts && git commit -m "refactor: extract user deletion into a service and fix admin delete tests"
```

---

### Task 7: Self-serve `deleteOwnAccountAction` and landing page

**Files:**
- Create: `lib/constants/account.ts`
- Create: `actions/account-actions.ts`
- Create: `app/account-deleted/page.tsx`
- Test: `actions/__tests__/account-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` from `lib/current-user.ts`; `findDeletionBlockers`, `deleteUserData`, `DeletionBlocker` from Task 6; `clerkClient` from `@clerk/nextjs/server`.
- Produces:
  ```ts
  // lib/constants/account.ts
  export const DELETE_CONFIRMATION_PHRASE = "DELETE";
  // actions/account-actions.ts
  export type DeleteOwnAccountResult =
    | { success: true }
    | { success: false; error: string; blockers?: DeletionBlocker[] };
  export async function deleteOwnAccountAction(input: { confirmation: string }): Promise<DeleteOwnAccountResult>;
  ```
  Task 8's dialog calls this. Plan 3 adds push-device cleanup inside `deleteUserData`, so nothing here changes.

- [ ] **Step 1: Write the failing tests**

```ts
// actions/__tests__/account-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/services/user-deletion.service", () => ({
  findDeletionBlockers: vi.fn(),
  deleteUserData: vi.fn(),
}));
const deleteUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser } })),
}));

import { getCurrentUser } from "@/lib/current-user";
import { findDeletionBlockers, deleteUserData } from "@/lib/services/user-deletion.service";
import { deleteOwnAccountAction } from "../account-actions";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockFindBlockers = vi.mocked(findDeletionBlockers);
const mockDeleteUserData = vi.mocked(deleteUserData);

const trainer = { id: "u_trainer", clerkId: "clerk_t", role: "TRAINER" };
const client = { id: "u_client", clerkId: "clerk_c", role: "CLIENT" };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindBlockers.mockResolvedValue([]);
  mockDeleteUserData.mockResolvedValue(undefined);
  deleteUser.mockResolvedValue({});
});

describe("deleteOwnAccountAction", () => {
  it("rejects a wrong confirmation phrase without touching data", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    const result = await deleteOwnAccountAction({ confirmation: "delete me" });
    expect(result.success).toBe(false);
    expect(mockFindBlockers).not.toHaveBeenCalled();
    expect(mockDeleteUserData).not.toHaveBeenCalled();
  });

  it("deletes a client's data and Clerk user", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(result).toEqual({ success: true });
    expect(mockFindBlockers).toHaveBeenCalledWith("u_client", { includeActiveClients: false });
    expect(mockDeleteUserData).toHaveBeenCalledWith("u_client");
    expect(deleteUser).toHaveBeenCalledWith("clerk_c");
  });

  it("checks active clients for trainers and returns blockers", async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never);
    const blocker = { code: "ACTIVE_CLIENTS" as const, count: 2, message: "you still have 2 active client(s). Deactivate or reassign them before deleting your account." };
    mockFindBlockers.mockResolvedValue([blocker]);
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(mockFindBlockers).toHaveBeenCalledWith("u_trainer", { includeActiveClients: true });
    expect(result).toEqual({ success: false, error: blocker.message, blockers: [blocker] });
    expect(mockDeleteUserData).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a data-removal failure and leaves Clerk alone", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    mockDeleteUserData.mockRejectedValue(new Error("db down"));
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(result.success).toBe(false);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("still succeeds if the Clerk delete fails after data is gone", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never);
    deleteUser.mockRejectedValue(new Error("clerk 500"));
    const result = await deleteOwnAccountAction({ confirmation: "DELETE" });
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run actions/__tests__/account-actions.test.ts`
Expected: FAIL, cannot resolve `../account-actions`.

- [ ] **Step 3: Write the constant, action, and landing page**

```ts
// lib/constants/account.ts
/** Users type this, exactly, to confirm permanent account deletion. */
export const DELETE_CONFIRMATION_PHRASE = "DELETE";
```

```ts
// actions/account-actions.ts
"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { DELETE_CONFIRMATION_PHRASE } from "@/lib/constants/account";
import {
  deleteUserData,
  findDeletionBlockers,
  type DeletionBlocker,
} from "@/lib/services/user-deletion.service";

export type DeleteOwnAccountResult =
  | { success: true }
  | { success: false; error: string; blockers?: DeletionBlocker[] };

/**
 * Self-serve account deletion (mobile spec §6; required by Apple 5.1.1(v)).
 * Order: DB data first, then the Clerk user. The Clerk `user.deleted`
 * webhook runs `prisma.user.deleteMany` which is then a harmless no-op.
 */
export async function deleteOwnAccountAction(input: {
  confirmation: string;
}): Promise<DeleteOwnAccountResult> {
  const user = await getCurrentUser();

  if (input.confirmation.trim() !== DELETE_CONFIRMATION_PHRASE) {
    return { success: false, error: `Type ${DELETE_CONFIRMATION_PHRASE} to confirm.` };
  }

  const blockers = await findDeletionBlockers(user.id, {
    includeActiveClients: user.role === "TRAINER",
  });
  if (blockers.length > 0) {
    return { success: false, error: blockers[0].message, blockers };
  }

  try {
    await deleteUserData(user.id);
  } catch (error) {
    console.error("[account-deletion] data removal failed for", user.id, error);
    return {
      success: false,
      error: "We couldn't delete your account right now. Please try again or contact support.",
    };
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(user.clerkId);
  } catch (error) {
    // The database row is already gone. If this Clerk user signs in again
    // they are treated as brand new and sent to onboarding; ops can remove
    // the Clerk record manually from the logged id.
    console.error("[account-deletion] clerk delete failed for", user.clerkId, error);
  }

  return { success: true };
}
```

```tsx
// app/account-deleted/page.tsx
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <CardTitle>Your account has been deleted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Your profile, health and fitness records, and messages have been removed.
            We&apos;re sorry to see you go.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run actions/__tests__/account-actions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 4b: Harden the Clerk `user.deleted` webhook**

`app/api/webhooks/clerk/route.ts` currently handles Clerk-side deletion with:

```ts
  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      await prisma.user.deleteMany({ where: { clerkId: id } });
    }
  }
```

This is a second, independent deletion path, and it is broken. Every relation back to `User` is
required and has no `onDelete: Cascade`, so for any real account this either throws a relation
violation (the Clerk user is gone, the app row and all health data survive, and the webhook 500s)
or, for an empty account, removes the `User` row while orphaning nothing. `app/(platform)/settings/page.tsx`
renders Clerk's `<UserProfile>`, which exposes self-deletion when that option is enabled in the
Clerk dashboard — so a user can reach this path today. The privacy policy added in Task 5 promises
that deletion removes health and fitness records, so this path must honour the same promise.

Route it through the service instead:

```ts
import { deleteUserData } from "@/lib/services/user-deletion.service";

  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      const user = await prisma.user.findUnique({ where: { clerkId: id }, select: { id: true } });
      if (user) {
        try {
          await deleteUserData(user.id);
        } catch (error) {
          // Leave the row in place for a retry rather than half-deleting it;
          // Svix redelivers on a non-2xx response.
          console.error("[clerk-webhook] user.deleted cleanup failed for", id, error);
          return new NextResponse("Cleanup failed", { status: 500 });
        }
      }
    }
  }
```

Add tests to `app/api/webhooks/clerk/__tests__/route.test.ts` (create the folder if absent), mocking
`@/lib/services/user-deletion.service` and `@/lib/prisma`:

```ts
it("routes a user.deleted event through deleteUserData", async () => {
  mockFindUnique.mockResolvedValue({ id: "user_1" });
  // …dispatch a verified user.deleted event…
  expect(mockDeleteUserData).toHaveBeenCalledWith("user_1");
});

it("is a no-op when no local user matches the Clerk id", async () => {
  mockFindUnique.mockResolvedValue(null);
  // …dispatch…
  expect(mockDeleteUserData).not.toHaveBeenCalled();
});

it("returns 500 without deleting the row when cleanup fails", async () => {
  mockFindUnique.mockResolvedValue({ id: "user_1" });
  mockDeleteUserData.mockRejectedValue(new Error("db down"));
  const res = await POST(request);
  expect(res.status).toBe(500);
});
```

If verifying the Svix signature inside a test proves impractical, extract the event-handling body
into an exported pure function (for example `handleClerkEvent(evt)`) and test that directly, leaving
signature verification in the route. Say which approach you took.

Run: `npx vitest run app/api/webhooks`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint actions/account-actions.ts lib/constants/account.ts app/account-deleted app/api/webhooks/clerk`
Expected: no errors. (`/account-deleted` was added to public routes in Task 5.)

- [ ] **Step 6: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add lib/constants/account.ts actions/account-actions.ts actions/__tests__/account-actions.test.ts app/account-deleted app/api/webhooks/clerk && git commit -m "feat: add self-serve account deletion action"
```

---

### Task 8: Delete-account UI in Settings

**Files:**
- Create: `components/settings/delete-account-section.tsx`
- Modify: `app/(platform)/settings/page.tsx`
- Test: `components/settings/__tests__/delete-account-section.test.tsx`

**Interfaces:**
- Consumes: `deleteOwnAccountAction`, `DeleteOwnAccountResult` (Task 7); `DELETE_CONFIRMATION_PHRASE`; `AlertDialog*` from `components/ui/alert-dialog`; `Input`, `Button`, `Card*`; `toast` from `sonner`; `useClerk` from `@clerk/nextjs`.
- Produces:
  ```tsx
  export function DeleteAccountSection({ role }: { role: "TRAINER" | "CLIENT" }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// components/settings/__tests__/delete-account-section.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/actions/account-actions", () => ({ deleteOwnAccountAction: vi.fn() }));

import { DeleteAccountSection } from "../delete-account-section";

describe("DeleteAccountSection", () => {
  it("renders the danger zone with a delete button and closed dialog", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection role="CLIENT" />);
    expect(html).toContain("Delete account");
    expect(html).toContain("Delete my account");
    expect(html).not.toContain("Type DELETE");
  });

  it("warns trainers about active clients", () => {
    const html = renderToStaticMarkup(<DeleteAccountSection role="TRAINER" />);
    expect(html).toMatch(/active clients/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/settings/__tests__/delete-account-section.test.tsx`
Expected: FAIL, cannot resolve `../delete-account-section`.

- [ ] **Step 3: Write the component**

```tsx
// components/settings/delete-account-section.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteOwnAccountAction } from "@/actions/account-actions";
import { DELETE_CONFIRMATION_PHRASE } from "@/lib/constants/account";
import type { DeletionBlocker } from "@/lib/services/user-deletion.service";

interface DeleteAccountSectionProps {
  role: "TRAINER" | "CLIENT";
}

/** Settings danger zone (mobile spec §6). Works on web and inside the native shell. */
export function DeleteAccountSection({ role }: DeleteAccountSectionProps) {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [pending, startTransition] = useTransition();

  const canSubmit = confirmation.trim() === DELETE_CONFIRMATION_PHRASE && !pending;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteOwnAccountAction({ confirmation });
      if (!result.success) {
        setBlockers(result.blockers ?? []);
        toast.error(result.error);
        return;
      }
      try {
        await signOut({ redirectUrl: "/account-deleted" });
      } catch {
        // The Clerk user may already be gone; the session is invalid either way.
        window.location.assign("/account-deleted");
      }
    });
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently removes your profile, health and fitness records, messages, and
          notification devices. This cannot be undone.
          {role === "TRAINER" && (
            <> You must deactivate or reassign your active clients first.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>

        <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setConfirmation(""); setBlockers([]); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Type <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRMATION_PHRASE}</span> to
                confirm. Everything you have logged and every message you have sent will be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Input
              autoFocus
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={DELETE_CONFIRMATION_PHRASE}
              aria-label={`Type ${DELETE_CONFIRMATION_PHRASE} to confirm`}
              autoCapitalize="characters"
              autoComplete="off"
            />

            {blockers.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning-foreground">
                {blockers.map((b) => (
                  <li key={b.code}>
                    {b.message.charAt(0).toUpperCase() + b.message.slice(1)}
                    {b.code === "ACTIVE_CLIENTS" && (
                      <>
                        {" "}
                        <Link href="/clients" className="underline" onClick={() => setOpen(false)}>
                          Go to clients
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDelete} disabled={!canSubmit}>
                {pending ? "Deleting…" : "Delete account"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/settings/__tests__/delete-account-section.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Mount it in Settings with legal links**

Replace `app/(platform)/settings/page.tsx`:

```tsx
import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { clerkAppearance } from "@/lib/ui/clerk-appearance";
import { getCurrentUser } from "@/lib/current-user";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <PageShell>
      <PageHeader title="Settings" description="Manage your account and profile" />
      <UserProfile appearance={clerkAppearance} />

      <nav aria-label="Legal" className="flex gap-4 text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
      </nav>

      <DeleteAccountSection role={user.role} />
    </PageShell>
  );
}
```

- [ ] **Step 6: Type-check, lint, and exercise the flow**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components/settings "app/(platform)/settings/page.tsx"`
Expected: no errors.

Manual, against a **development database** with a throwaway account:
1. As a trainer with an active client, open Settings → Delete my account → type DELETE → Delete account. Expected: toast and in-dialog notice about active clients with a "Go to clients" link; nothing deleted.
2. Deactivate that client, repeat. Expected: redirected to `/account-deleted`; signing in with the same email lands on onboarding as a new user; the Clerk dashboard no longer lists the user.
3. As a client, repeat. Expected: same success path.
4. At 390px width, the dialog fits on screen and the input does not trigger page zoom when `?native=ios` is set.

- [ ] **Step 7: Checkpoint**

Run: `git status --short` and confirm only this task's files changed.

Then commit:

```bash
git add components/settings "app/(platform)/settings/page.tsx" && git commit -m "feat: add delete account section and legal links to settings"
```

---

### Task 9: Full verification

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: the 3 `actions/__tests__/admin-actions.test.ts` failures that existed before this plan are gone (Task 6 fixed them), and no new failures appear.

Two failures in `components/dashboard/__tests__/client-dashboard-render.test.tsx` are pre-existing, unrelated to this plan, and expected to remain. They are a real timezone bug, not flakiness: the file passes under `TZ=UTC` and `TZ=America/New_York` but fails under a UTC+N zone between local midnight and 0N:00, because a session scheduled `new Date()` is bucketed to the previous day by the UTC-anchored calendar helpers, so the "TODAY" branch never renders. Confirm they are the only remaining failures; do not fix them here.

- [ ] **Step 2: Lint, type-check, build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: zero type errors, and a successful production build with `/privacy`, `/terms` and `/account-deleted` listed as routes.

**Lint is measured against a baseline, not against zero.** `npm run lint` does not pass on this repository and did not before this plan: the pre-plan commit `757e49e` reports 368 problems (310 errors), overwhelmingly `@typescript-eslint/no-explicit-any` in existing test files and services. Clearing that debt is not this plan's job. Instead:

1. Run `npm run lint` and record the totals. They must be no worse than the 368 problems / 310 errors baseline.
2. Lint every file this plan touched, one at a time, from `git diff --name-only 757e49e HEAD`. Note that `app/(platform)/layout.tsx` contains parentheses, so quote each path rather than passing the list through a glob.
3. Every plan-touched file must be clean, with exactly one permitted exception: `actions/__tests__/admin-actions.test.ts` carries 6 pre-existing `no-explicit-any` errors from this repo's established Prisma-mock test style. The baseline had 8 of them there; do not add more, and do not refactor them away in this plan.
4. The `design/no-raw-palette` rule must report zero violations anywhere in the plan's files. That rule is the one this plan genuinely must satisfy.

- [ ] **Step 3: Phone-width smoke pass**

Run `npm run dev` and use Chrome device mode at 390×844 with `?native=ios` once, then `?native=off`:

| Check | Expected |
|---|---|
| `/dashboard` as client | Five tabs, active highlight, no horizontal scroll, content not hidden behind bar |
| `/dashboard` as trainer | Four tabs + More; More sheet lists Exercises, Nutrition, Analytics, Billing, Settings, Organization, Audit Log |
| `/messages` with unread | Badge on Inbox tab matches sidebar badge at desktop width |
| Header menu button | Still opens the sidebar sheet on small screens |
| `document.documentElement.hasAttribute("data-native")` | `true` with `?native=ios`, `false` after `?native=off` |
| `/privacy`, `/terms` signed out | Render, no redirect |
| Settings | Legal links and Delete account card present for both roles |
| Desktop ≥1024px | No tab bar; sidebar unchanged |

- [ ] **Step 4: Report**

Summarize for the owner: files changed, test counts, the three `lib/legal/company.ts` values to confirm, and the footer compliance badge note from Task 5. This task changes no files, so it makes no commit.

---

## Self-review against the spec

- **§4 native detection:** Task 1 (parser, server helper), Task 2 (provider, hook, `data-native`, viewport tweak, dev override). ✔
- **§5 navigation:** Task 3 (nav-items with tiers), Task 4 (tab bar, More sheet, header inset, main padding). Splash handoff, back button, app-state refresh, haptics, external links, download bridge are Capacitor-plugin dependent and belong to Plans 2 and 4 by the spec's phase list. ✔
- **§5 safe areas & native CSS:** Task 2 step 7, Task 4 steps 5–6. Status bar style follows theme in Plan 2 (plugin). ✔
- **§6 account deletion:** Tasks 6–8, with the trainer active-client block. ✔
- **§6 legal pages:** Task 5. ✔
- **§6 email-only sign-in, Clerk session settings:** Plan 4 and Plan 0 respectively, per the roadmap. ✔
- **§12 tests listed for this phase:** `parseNativeUserAgent` (Task 1), nav items match (Task 3), `deleteOwnAccountAction` (Task 7). Billing branch and push tests belong to Plans 3–4. ✔
- **Type consistency:** `NativeInfo`, `Role`, `NavItem`, `DeletionBlocker`, `DeleteOwnAccountResult` names match across tasks. `findActiveHref(pathname, hrefs)` signature identical in Tasks 3 and 4. ✔
