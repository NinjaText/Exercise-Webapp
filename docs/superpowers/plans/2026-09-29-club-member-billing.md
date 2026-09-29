# Club Orgs & Member-Pays Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `CLUB` org type whose members self-join with an access code, get platform-authored starter programs auto-assigned, run on a no-card free trial, and pay per member via Stripe, all managed from `/admin/clubs`, with zero behavior change for trainer orgs.

**Architecture:** `Organization.type` (null ⇒ TRAINER) feeds one pure function, `getOrgCapabilities()`, which every surface reads (billing gate, nav, route guards, webhooks). Members get a `MemberSubscription` that mirrors `TrainerSubscription`, and both gates share the pure `evaluateAccess()`. Joining runs `/join/[slug]` → code check (HMAC cookie + DB rate limit) → Clerk sign-up → `/join/[slug]/complete`, which enrolls the member synchronously. Starter programs are Global Programs copied to the member in the background, with a cron sweep for retries and progression.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma on MongoDB, Clerk v7 (`@clerk/nextjs`), Stripe, Resend + React email templates, Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-29-club-member-billing-design.md`

## Global Constraints

- **Never `git add` / `git commit`.** The owner reviews and commits. Every "Checkpoint" step below means: run the listed checks, leave changes uncommitted.
- **Never run `prisma db push`, migrations, scripts, emails or Stripe calls against `.env`.** It is production. Only `npx prisma generate` is allowed locally. The owner runs `db push` before deploy.
- New Mongo fields on **existing** collections (`Organization`) are optional with no `@default`, because existing documents lack the key. Read them through helpers (`getOrgType`), the same convention as `Program.schedulingType`.
- `Organization.type` is changed **only** by super-admin club code. Trainer signup keeps creating orgs with no `type` (⇒ TRAINER).
- `getOrgCapabilities()` in `lib/org-capabilities.ts` is the only code that compares against `"CLUB"`. Everything else reads capabilities.
- Trainer billing behavior, trainer checkout, trainer portal and invited-client flow must be byte-for-byte unchanged in outcome.
- Use design-system tokens only (`lint:palette` must stay at 0 raw palette classes). Reuse `components/ui/*` and `StatusBadge`.
- Starter programs are copied with `duplicateProgram(templateId, staffUserId)` then `assignProgram(copy.id, memberId, startDate)`. **Never assign a template directly** (`assignProgram` mutates the program).
- New env vars: `CLUB_JOIN_SECRET` (≥32 random chars, signs the join cookie) and `PLATFORM_STAFF_EMAIL` (email of the TRAINER DB user that owns club program copies). Document both in `.env.example` if it exists.
- Audit every super-admin club mutation with `logUserAudit` (`lib/services/audit-log.service.ts`).

## Refinements to the spec (found while grounding in code)

1. **Progression trigger.** Programs are never set to `COMPLETED` anywhere in this codebase. A starter program counts as *finished* when it has no `WorkoutSessionV2` in `SCHEDULED` or `IN_PROGRESS` (the `mark-missed-sessions` cron turns stale ones into `MISSED`). The 15-minute starter cron checks this and assigns the next program.
2. **Staff account.** Club program copies are owned by the DB user whose email is `PLATFORM_STAFF_EMAIL`. That user is **not** added to each club's Clerk org, because the `organizationMembership.created` webhook would overwrite its `User.clerkOrgId`. For the same reason, `createOrganization` is called without `createdBy`.
3. **Starter templates are Global Programs** (`Program.isGlobal = true`, authored in `/admin/global-programs`), and must be Scheduled (not On-Demand).
4. **Capabilities** are `{ billing, messaging, checkIns }`. Clinical notes are trainer-only already, so no member flag is needed. Voice notes live inside messaging.
5. **Enrollment is synchronous** in `/join/[slug]/complete` (no webhook race). The Clerk webhook only *ensures* the subscription as a backup.
6. **Existing bug fixed along the way:** `completeClientOnboarding` writes `clerkOrgId: orgId ?? null`, which would null a member's org when the session has no active org. It now keeps the stored value.

## Review Focus

1. **Existing trainer / invited client hits `/join`.** The join must be refused with a clear message, their `clerkOrgId` must not change, and no `MemberSubscription` may be created (Task 6 test "refuses a trainer / another org's client").
2. **Double submit or refresh of `/join/[slug]/complete`, plus webhook replay.** Exactly one `MemberSubscription`, one starter copy, and the trial end date is never reset (Task 6 "idempotent" test, Task 7 webhook test).
3. **Member whose trial ended mid-session navigates, then pays.** Gate → `/billing` member variant → after `checkout.session.completed` the gate lets them through. A canceled member can resubscribe with the same Stripe customer (Task 2 + Task 9 tests).
4. **Club admin edits `trialDays` after members joined.** Existing members' `trialEndsAt` is unchanged; only new joiners get the new length (Task 5 test "updateClub does not touch existing trials").
5. **Wrong-code brute force and code rotation.** The 11th wrong attempt in 15 min is refused even with the right code. After admin rotates the code, an old cookie still works only until its 30-min expiry, and the old code no longer verifies (Task 4 tests).

---

## File Map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `OrgType`, new `Organization` fields, `MemberSubscription`, `JoinCodeAttempt` |
| `lib/org-capabilities.ts` | Pure: `getOrgType`, `getOrgCapabilities`, `hiddenNavHrefs` |
| `lib/org-capabilities.server.ts` | Server: `getOrgForUser`, `requireCapability` |
| `lib/billing/access.ts` | Pure: `evaluateAccess`, `trialDaysLeft` |
| `components/layout/nav-items.ts` (+ sidebar, header, mobile-tab-bar) | Nav filtering by hidden hrefs |
| `app/(platform)/messages/layout.tsx`, `app/(platform)/check-ins/layout.tsx` | Route guards |
| `components/billing/member-trial-banner.tsx` | Trial banner |
| `lib/clubs/join-token.ts` | Pure: HMAC join cookie + code compare |
| `lib/services/join-attempt.service.ts` | DB rate limit for code attempts |
| `lib/services/club.service.ts` | Club CRUD, validation, stats, org-type guard, staff user |
| `lib/clubs/starter-progression.ts` | Pure: next template / finished checks |
| `lib/services/club-member.service.ts` | Enrollment, subscription ensure, starter assignment, sweep |
| `app/join/[slug]/*` | Public join page, code form, sign-up, completion |
| `actions/club-join-actions.ts` | `verifyJoinCodeAction` |
| `lib/services/member-billing.service.ts` | Stripe ↔ `MemberSubscription` sync |
| `app/api/checkout/member/route.ts`, `app/api/stripe/member-portal/route.ts` | Member checkout + portal |
| `app/billing/member-billing-view.tsx` | Member billing page variant |
| `lib/email/templates/member-trial-reminder.tsx` | Reminder email |
| `lib/clubs/trial-reminders.ts` | Pure: which reminder is due |
| `app/api/cron/club-starter-programs/route.ts`, `app/api/cron/member-trial-reminders/route.ts` | Crons |
| `actions/admin-club-actions.ts`, `app/admin/clubs/**` | Super-admin UI |

---

### Task 1: Schema and org capabilities

**Files:**
- Modify: `prisma/schema.prisma` (Organization model ~line 198, User model ~line 118, append new models)
- Create: `lib/org-capabilities.ts`
- Create: `lib/org-capabilities.server.ts`
- Test: `lib/__tests__/org-capabilities.test.ts`

**Interfaces:**
- Produces:
  - `type OrgType = "TRAINER" | "CLUB"` (Prisma enum)
  - `getOrgType(org: { type?: OrgType | null } | null | undefined): OrgType`
  - `interface OrgCapabilities { billing: "trainer" | "member"; messaging: boolean; checkIns: boolean }`
  - `getOrgCapabilities(org: { type?: OrgType | null } | null | undefined): OrgCapabilities`
  - `hiddenNavHrefs(caps: OrgCapabilities): string[]`
  - `getOrgForUser(user: { clerkOrgId: string | null }): Promise<Organization | null>` (server, React-`cache`d)
  - `requireCapability(cap: "messaging" | "checkIns"): Promise<void>` (server, redirects to `/dashboard`)

- [ ] **Step 1: Extend the schema**

In `prisma/schema.prisma` add the enum after `enum SubStatus`:

```prisma
enum OrgType {
  TRAINER
  CLUB
}
```

Add to `model Organization` (after `exerciseSourcePreference`):

```prisma
  // ── Org type & club config ───────────────────────────────────────────────
  /// null → TRAINER. Optional with no @default on purpose: existing documents
  /// lack the key. Read via getOrgType() in lib/org-capabilities.ts.
  type              OrgType?
  /// Club-only. Public join path segment: /join/<joinSlug>.
  joinSlug          String?  @unique
  /// Club-only. Access code members type on the join page (stored upper-case).
  joinCode          String?
  /// Club-only. Free-trial length for newly joined members.
  trialDays         Int?
  /// Club-only. Recurring Stripe price members subscribe to.
  stripePriceId     String?
  /// Club-only. Ordered Global Program ids; members get them one after another.
  starterProgramIds String[] @default([]) @db.ObjectId
```

Add to `model User` relations (next to `trainerSubscription`):

```prisma
  memberSubscription        MemberSubscription?     @relation("MemberSubscription")
```

Append at the end of the file:

```prisma
/// Per-member subscription for CLUB orgs. Mirrors TrainerSubscription; the
/// Stripe ids stay null until the member first subscribes (no-card trial).
model MemberSubscription {
  id                   String    @id @default(auto()) @map("_id") @db.ObjectId
  userId               String    @unique @db.ObjectId
  user                 User      @relation("MemberSubscription", fields: [userId], references: [id])
  clerkOrgId           String
  status               SubStatus @default(TRIALING)
  trialEndsAt          DateTime
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  /// Trial reminder keys already sent: "d3" | "d1" | "d0".
  remindersSent        String[]  @default([])
  /// PENDING | ASSIGNED | FAILED — state of the current starter assignment.
  starterStatus        String    @default("PENDING")
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([clerkOrgId, status])
  @@index([status, trialEndsAt])
  @@index([starterStatus])
}

/// One failed access-code attempt on /join. Counted in a sliding window for
/// rate limiting; key = "<ip>:<joinSlug>".
model JoinCodeAttempt {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  key       String
  createdAt DateTime @default(now())

  @@index([key, createdAt])
}
```

- [ ] **Step 2: Generate the client (no db push)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client". Do **not** run `prisma db push`.

- [ ] **Step 3: Write the failing test**

Create `lib/__tests__/org-capabilities.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getOrgType, getOrgCapabilities, hiddenNavHrefs } from "@/lib/org-capabilities";

describe("getOrgType", () => {
  it("treats a missing org or missing type as TRAINER", () => {
    expect(getOrgType(null)).toBe("TRAINER");
    expect(getOrgType(undefined)).toBe("TRAINER");
    expect(getOrgType({})).toBe("TRAINER");
    expect(getOrgType({ type: null })).toBe("TRAINER");
  });
  it("returns CLUB for club orgs", () => {
    expect(getOrgType({ type: "CLUB" })).toBe("CLUB");
  });
});

describe("getOrgCapabilities", () => {
  it("gives trainer orgs today's full feature set", () => {
    expect(getOrgCapabilities({ type: "TRAINER" })).toEqual({
      billing: "trainer",
      messaging: true,
      checkIns: true,
    });
    expect(getOrgCapabilities(null)).toEqual(getOrgCapabilities({ type: "TRAINER" }));
  });
  it("makes club orgs member-billed and self-guided", () => {
    expect(getOrgCapabilities({ type: "CLUB" })).toEqual({
      billing: "member",
      messaging: false,
      checkIns: false,
    });
  });
});

describe("hiddenNavHrefs", () => {
  it("hides nothing for trainer orgs", () => {
    expect(hiddenNavHrefs(getOrgCapabilities(null))).toEqual([]);
  });
  it("hides inbox and check-ins for clubs", () => {
    expect(hiddenNavHrefs(getOrgCapabilities({ type: "CLUB" }))).toEqual(["/messages", "/check-ins"]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run lib/__tests__/org-capabilities.test.ts`
Expected: FAIL, "Cannot find module '@/lib/org-capabilities'".

- [ ] **Step 5: Implement**

Create `lib/org-capabilities.ts`:

```ts
import type { OrgType } from "@prisma/client";

/**
 * The single place that knows what an org's type means. Every surface
 * (billing gate, nav, route guards, webhooks) reads capabilities from here —
 * nothing else compares against "CLUB".
 */

export interface OrgCapabilities {
  /** Who is charged: the trainer (TrainerSubscription) or each member (MemberSubscription). */
  billing: "trainer" | "member";
  /** Inbox, chat and voice notes. Clubs are self-guided — nobody answers. */
  messaging: boolean;
  checkIns: boolean;
}

type OrgLike = { type?: OrgType | null } | null | undefined;

/** Existing documents have no `type` key, so absence means TRAINER. */
export function getOrgType(org: OrgLike): OrgType {
  return org?.type ?? "TRAINER";
}

const TRAINER_CAPABILITIES: OrgCapabilities = Object.freeze({
  billing: "trainer",
  messaging: true,
  checkIns: true,
});

const CLUB_CAPABILITIES: OrgCapabilities = Object.freeze({
  billing: "member",
  messaging: false,
  checkIns: false,
});

export function getOrgCapabilities(org: OrgLike): OrgCapabilities {
  return getOrgType(org) === "CLUB" ? { ...CLUB_CAPABILITIES } : { ...TRAINER_CAPABILITIES };
}

/** Route prefixes owned by each switchable capability. */
export const CAPABILITY_ROUTES = {
  messaging: "/messages",
  checkIns: "/check-ins",
} as const satisfies Record<"messaging" | "checkIns", string>;

/** Nav hrefs to drop for an org, in a stable order. */
export function hiddenNavHrefs(caps: OrgCapabilities): string[] {
  const hidden: string[] = [];
  if (!caps.messaging) hidden.push(CAPABILITY_ROUTES.messaging);
  if (!caps.checkIns) hidden.push(CAPABILITY_ROUTES.checkIns);
  return hidden;
}
```

Create `lib/org-capabilities.server.ts`:

```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org-capabilities";

/** The user's org row. DB `clerkOrgId` is canonical (clients inherit their org). */
export const getOrgForUser = cache(
  async (user: { clerkOrgId: string | null }): Promise<Organization | null> => {
    if (!user.clerkOrgId) return null;
    return prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  }
);

export async function getCurrentCapabilities(): Promise<OrgCapabilities> {
  const user = await getCurrentUser();
  return getOrgCapabilities(await getOrgForUser(user));
}

/** Server-component guard for feature routes a club org doesn't have. */
export async function requireCapability(cap: "messaging" | "checkIns"): Promise<void> {
  const caps = await getCurrentCapabilities();
  if (!caps[cap]) redirect("/dashboard");
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/org-capabilities.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 7: Checkpoint.** Leave uncommitted.

---

### Task 2: Shared access check and the member billing gate

**Files:**
- Create: `lib/billing/access.ts`
- Test: `lib/billing/__tests__/access.test.ts`
- Modify: `app/(platform)/layout.tsx:51-67` (billing gate)

**Interfaces:**
- Consumes: `getOrgCapabilities` (Task 1), `getOrgForUser` (Task 1).
- Produces:
  - `type AccessVerdict = "ok" | "trial_expired" | "payment_failed"`
  - `evaluateAccess(sub: { status: SubStatus; trialEndsAt: Date } | null, now: Date): AccessVerdict`
  - `trialDaysLeft(sub: { status: SubStatus; trialEndsAt: Date } | null, now: Date): number | null`: whole days rounded up, `null` when not trialing or already expired.

- [ ] **Step 1: Write the failing test**

Create `lib/billing/__tests__/access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateAccess, trialDaysLeft } from "@/lib/billing/access";

const now = new Date("2026-10-01T12:00:00Z");
const future = new Date("2026-10-05T12:00:00Z");
const past = new Date("2026-09-30T12:00:00Z");

describe("evaluateAccess", () => {
  it.each([
    ["no subscription", null, "trial_expired"],
    ["trialing, not expired", { status: "TRIALING", trialEndsAt: future }, "ok"],
    ["trialing, expired", { status: "TRIALING", trialEndsAt: past }, "trial_expired"],
    ["trialing, ends exactly now", { status: "TRIALING", trialEndsAt: now }, "ok"],
    ["active", { status: "ACTIVE", trialEndsAt: past }, "ok"],
    ["canceled", { status: "CANCELED", trialEndsAt: future }, "trial_expired"],
    ["past due", { status: "PAST_DUE", trialEndsAt: past }, "payment_failed"],
    ["unpaid", { status: "UNPAID", trialEndsAt: past }, "payment_failed"],
  ] as const)("%s → %s", (_label, sub, expected) => {
    expect(evaluateAccess(sub as any, now)).toBe(expected);
  });
});

describe("trialDaysLeft", () => {
  it("rounds partial days up", () => {
    expect(trialDaysLeft({ status: "TRIALING", trialEndsAt: new Date("2026-10-02T13:00:00Z") }, now)).toBe(2);
  });
  it("is null when not trialing or expired", () => {
    expect(trialDaysLeft(null, now)).toBeNull();
    expect(trialDaysLeft({ status: "ACTIVE", trialEndsAt: future }, now)).toBeNull();
    expect(trialDaysLeft({ status: "TRIALING", trialEndsAt: past }, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/billing/__tests__/access.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/billing/access.ts`**

```ts
import type { SubStatus } from "@prisma/client";

/**
 * The one billing-gate rule, shared by trainers (TrainerSubscription) and club
 * members (MemberSubscription). Extracted verbatim from the original trainer
 * gate in app/(platform)/layout.tsx so both stay identical.
 */
export type AccessVerdict = "ok" | "trial_expired" | "payment_failed";

type SubLike = { status: SubStatus; trialEndsAt: Date } | null;

export function evaluateAccess(sub: SubLike, now: Date): AccessVerdict {
  if (!sub || sub.status === "CANCELED") return "trial_expired";
  if (sub.status === "TRIALING" && sub.trialEndsAt < now) return "trial_expired";
  if (sub.status === "PAST_DUE" || sub.status === "UNPAID") return "payment_failed";
  return "ok";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialDaysLeft(sub: SubLike, now: Date): number | null {
  if (!sub || sub.status !== "TRIALING" || sub.trialEndsAt < now) return null;
  return Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/billing/__tests__/access.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the gate in `app/(platform)/layout.tsx`**

Add imports:

```ts
import { evaluateAccess, trialDaysLeft } from "@/lib/billing/access";
import { getOrgCapabilities, hiddenNavHrefs } from "@/lib/org-capabilities";
import { getOrgForUser } from "@/lib/org-capabilities.server";
```

Replace the whole `// Billing gate` block (the `if (user.role === "TRAINER") { ... }`) with:

```ts
  // Billing gate. Who pays depends on the org: trainers in trainer orgs,
  // each member in club orgs. Platform staff (a TRAINER inside a member-billed
  // org) is never gated.
  const org = await getOrgForUser(user);
  const caps = getOrgCapabilities(org);
  const now = new Date();
  let memberTrialDays: number | null = null;

  if (user.role === "TRAINER" && caps.billing === "trainer") {
    const sub = await prisma.trainerSubscription.findUnique({ where: { trainerId: user.id } });
    const verdict = evaluateAccess(sub, now);
    if (verdict !== "ok") redirect(`/billing?reason=${verdict}`);
  }

  if (user.role === "CLIENT" && caps.billing === "member") {
    const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    const verdict = evaluateAccess(sub, now);
    if (verdict !== "ok") redirect(`/billing?reason=${verdict}`);
    memberTrialDays = trialDaysLeft(sub, now);
  }

  const hiddenHrefs = hiddenNavHrefs(caps);
```

`hiddenHrefs` and `memberTrialDays` are used in Task 3. Until then, prefix them with `void` if lint complains about unused variables.

- [ ] **Step 6: Verify nothing changed for trainers**

Run: `npx vitest run && npx tsc --noEmit`
Expected: same pass/fail set as before this task (baseline has 5 known unrelated failures: admin-actions ×3, client-dashboard-render date flake ×2). No new failures.

- [ ] **Step 7: Checkpoint.** Leave uncommitted.

---

### Task 3: Hide club-disabled features (nav, route guards) and show the trial banner

**Files:**
- Modify: `components/layout/nav-items.ts:78-113`
- Modify: `components/layout/sidebar.tsx` (props + `getPrimaryNav` call)
- Modify: `components/layout/header.tsx` (forward `hiddenHrefs` to its mobile `Sidebar`)
- Modify: `components/layout/mobile-tab-bar.tsx:18-38`
- Modify: `app/(platform)/layout.tsx` (pass props, render banner)
- Create: `app/(platform)/messages/layout.tsx`, `app/(platform)/check-ins/layout.tsx`
- Create: `components/billing/member-trial-banner.tsx`
- Test: `components/layout/__tests__/nav-items-hidden.test.ts`

**Interfaces:**
- Consumes: `hiddenHrefs: string[]` and `memberTrialDays: number | null` from Task 2's layout block; `requireCapability` (Task 1).
- Produces:
  - `getPrimaryNav(role: Role, hidden?: string[]): NavItem[]`
  - `getTabLayout(role: Role, hidden?: string[]): TabLayout`
  - `getMoreItems(role: Role, isAdmin: boolean, hidden?: string[]): NavItem[]`
  - `Sidebar`, `Header`, `MobileTabBar` accept optional `hiddenHrefs?: string[]` (default `[]`)
  - `<MemberTrialBanner daysLeft={number} />`

- [ ] **Step 1: Write the failing test**

Create `components/layout/__tests__/nav-items-hidden.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getPrimaryNav, getTabLayout, getMoreItems } from "@/components/layout/nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("nav filtering by hidden hrefs", () => {
  it("is unchanged when nothing is hidden", () => {
    expect(getPrimaryNav("CLIENT", [])).toEqual(getPrimaryNav("CLIENT"));
    expect(getTabLayout("CLIENT", [])).toEqual(getTabLayout("CLIENT"));
  });

  it("removes the inbox for a club member everywhere", () => {
    const hidden = ["/messages", "/check-ins"];
    expect(hrefs(getPrimaryNav("CLIENT", hidden))).not.toContain("/messages");
    const { tabs, more } = getTabLayout("CLIENT", hidden);
    expect(hrefs(tabs)).not.toContain("/messages");
    expect(hrefs(more)).not.toContain("/messages");
    expect(hrefs(getMoreItems("CLIENT", false, hidden))).not.toContain("/messages");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/layout/__tests__/nav-items-hidden.test.ts`
Expected: FAIL. `/messages` is still present, because the extra argument is ignored.

- [ ] **Step 3: Implement the filtering in `nav-items.ts`**

Replace `getPrimaryNav`, `getTabLayout`, `getMoreItems` with:

```ts
/**
 * `hidden` holds hrefs the org's capabilities switch off (see
 * lib/org-capabilities.ts → hiddenNavHrefs). Empty for trainer orgs, so the
 * default call is exactly today's nav.
 */
export function getPrimaryNav(role: Role, hidden: string[] = []): NavItem[] {
  const nav = role === "TRAINER" ? TRAINER_NAV : CLIENT_NAV;
  return hidden.length ? nav.filter((item) => !hidden.includes(item.href)) : nav;
}

export function getTabLayout(role: Role, hidden: string[] = []): TabLayout {
  const nav = getPrimaryNav(role, hidden);
  const tabHrefs = role === "TRAINER" ? TRAINER_TAB_HREFS : CLIENT_TAB_HREFS;
  const tabs = tabHrefs
    .map((href) => nav.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const more = nav.filter((item) => !tabHrefs.includes(item.href));
  return { tabs, more };
}

export function getMoreItems(role: Role, isAdmin: boolean, hidden: string[] = []): NavItem[] {
  const { more } = getTabLayout(role, hidden);
  return [...more, ...getAccountNav(role), ...(isAdmin ? [ADMIN_NAV] : [])];
}
```

Keep the existing doc comments above `getMoreItems`.

- [ ] **Step 4: Run it to verify it passes, including the existing parity test**

Run: `npx vitest run components/layout`
Expected: PASS (including `sidebar-nav-parity.test.tsx`).

- [ ] **Step 5: Thread `hiddenHrefs` through the components**

- `components/layout/sidebar.tsx`: add `hiddenHrefs?: string[];` to `SidebarProps` with the doc comment `/** Hrefs the org's capabilities hide (club orgs). */`. Destructure `hiddenHrefs = []`. Change `getPrimaryNav(role)` to `getPrimaryNav(role, hiddenHrefs)`.
- `components/layout/mobile-tab-bar.tsx`: add `hiddenHrefs?: string[]` to `MobileTabBarProps` and destructure with default `[]`. Use `getTabLayout(role, hiddenHrefs)` and `getMoreItems(role, isAdmin, hiddenHrefs)`.
- `components/layout/header.tsx`: add `hiddenHrefs?: string[]` to `HeaderProps` and pass `hiddenHrefs={hiddenHrefs}` to the `<Sidebar>` it renders.
- `app/(platform)/layout.tsx`: pass `hiddenHrefs={hiddenHrefs}` to `<Sidebar>`, `<Header>` and `<MobileTabBar>`. Directly inside `<main>`, before `<div className="page-enter">`, render:

```tsx
{memberTrialDays !== null && <MemberTrialBanner daysLeft={memberTrialDays} />}
```

- [ ] **Step 6: Create the banner**

`components/billing/member-trial-banner.tsx`:

```tsx
import Link from "next/link";

/** Shown to club members during their free trial (platform layout). */
export function MemberTrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-info-border bg-info-soft px-4 py-3 text-sm text-info-foreground">
      <span>
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your free trial.
      </span>
      <Link href="/billing" className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80">
        Subscribe
      </Link>
    </div>
  );
}
```

- [ ] **Step 7: Add the route guards**

`app/(platform)/messages/layout.tsx`:

```tsx
import { requireCapability } from "@/lib/org-capabilities.server";

/** Club orgs are self-guided: no inbox (lib/org-capabilities.ts). */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireCapability("messaging");
  return children;
}
```

`app/(platform)/check-ins/layout.tsx` is the same, with `CheckInsLayout` and `requireCapability("checkIns")`.

If either folder already has a `layout.tsx`, add the `await requireCapability(...)` line at the top of its component instead of creating a new file.

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run lint:palette`
Expected: no new failures, tsc clean, palette count 0.

- [ ] **Step 9: Checkpoint.** Leave uncommitted.

---

### Task 4: Join token, code comparison and rate limit

**Files:**
- Create: `lib/clubs/join-token.ts`
- Create: `lib/services/join-attempt.service.ts`
- Test: `lib/clubs/__tests__/join-token.test.ts`
- Test: `lib/services/__tests__/join-attempt.service.test.ts`

**Interfaces:**
- Produces:
  - `JOIN_COOKIE = "club_join"`, `JOIN_TOKEN_TTL_MS = 30 * 60 * 1000`
  - `signJoinToken(clerkOrgId: string, now?: number): string`
  - `verifyJoinToken(token: string | undefined, clerkOrgId: string, now?: number): boolean`
  - `normalizeJoinCode(code: string): string` (trim + upper-case)
  - `joinCodesMatch(input: string, expected: string | null): boolean` (constant-time)
  - `JOIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }`
  - `isJoinRateLimited(key: string, now?: Date): Promise<boolean>`
  - `recordFailedJoinAttempt(key: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`lib/clubs/__tests__/join-token.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import {
  signJoinToken, verifyJoinToken, joinCodesMatch, normalizeJoinCode, JOIN_TOKEN_TTL_MS,
} from "@/lib/clubs/join-token";

beforeAll(() => {
  process.env.CLUB_JOIN_SECRET = "test-secret-test-secret-test-secret-xx";
});

describe("join token", () => {
  const t0 = 1_800_000_000_000;

  it("verifies for the same org before expiry", () => {
    const token = signJoinToken("org_abc", t0);
    expect(verifyJoinToken(token, "org_abc", t0 + 1000)).toBe(true);
  });
  it("rejects another org", () => {
    expect(verifyJoinToken(signJoinToken("org_abc", t0), "org_xyz", t0)).toBe(false);
  });
  it("rejects after expiry", () => {
    expect(verifyJoinToken(signJoinToken("org_abc", t0), "org_abc", t0 + JOIN_TOKEN_TTL_MS + 1)).toBe(false);
  });
  it("rejects a tampered expiry or signature", () => {
    const [org, exp, mac] = signJoinToken("org_abc", t0).split(".");
    expect(verifyJoinToken(`${org}.${Number(exp) + 999999}.${mac}`, "org_abc", t0)).toBe(false);
    expect(verifyJoinToken(`${org}.${exp}.AAAA`, "org_abc", t0)).toBe(false);
  });
  it("rejects missing / malformed tokens", () => {
    expect(verifyJoinToken(undefined, "org_abc", t0)).toBe(false);
    expect(verifyJoinToken("garbage", "org_abc", t0)).toBe(false);
  });
});

describe("join codes", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeJoinCode("  pineValley24 ")).toBe("PINEVALLEY24");
    expect(joinCodesMatch(" pinevalley24", "PINEVALLEY24")).toBe(true);
  });
  it("rejects wrong, empty, or unset codes", () => {
    expect(joinCodesMatch("PINEVALLEY25", "PINEVALLEY24")).toBe(false);
    expect(joinCodesMatch("", "PINEVALLEY24")).toBe(false);
    expect(joinCodesMatch("ANY", null)).toBe(false);
  });
});
```

`lib/services/__tests__/join-attempt.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { joinCodeAttempt: { count: vi.fn(), create: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { isJoinRateLimited, recordFailedJoinAttempt, JOIN_RATE_LIMIT } from "../join-attempt.service";

beforeEach(() => vi.clearAllMocks());

describe("join rate limit", () => {
  it("allows under the limit", async () => {
    vi.mocked(prisma.joinCodeAttempt.count).mockResolvedValue(JOIN_RATE_LIMIT.max - 1);
    expect(await isJoinRateLimited("1.2.3.4:pine")).toBe(false);
  });
  it("blocks at the limit and counts only the window", async () => {
    const now = new Date("2026-10-01T12:00:00Z");
    vi.mocked(prisma.joinCodeAttempt.count).mockResolvedValue(JOIN_RATE_LIMIT.max);
    expect(await isJoinRateLimited("1.2.3.4:pine", now)).toBe(true);
    expect(prisma.joinCodeAttempt.count).toHaveBeenCalledWith({
      where: { key: "1.2.3.4:pine", createdAt: { gte: new Date(now.getTime() - JOIN_RATE_LIMIT.windowMs) } },
    });
  });
  it("records a failed attempt", async () => {
    await recordFailedJoinAttempt("k");
    expect(prisma.joinCodeAttempt.create).toHaveBeenCalledWith({ data: { key: "k" } });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/clubs lib/services/__tests__/join-attempt.service.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `lib/clubs/join-token.ts`**

```ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived proof that a browser typed a club's access code, carried across
 * the Clerk sign-up redirect in an httpOnly cookie. Format:
 *   <clerkOrgId>.<expiresAtMs>.<base64url HMAC-SHA256>
 * Clerk org ids contain no "." so the split is unambiguous.
 */
export const JOIN_COOKIE = "club_join";
export const JOIN_TOKEN_TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.CLUB_JOIN_SECRET;
  if (!s || s.length < 32) throw new Error("CLUB_JOIN_SECRET must be set (≥32 chars)");
  return s;
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match for timingSafeEqual.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function signJoinToken(clerkOrgId: string, now = Date.now()): string {
  const payload = `${clerkOrgId}.${now + JOIN_TOKEN_TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

export function verifyJoinToken(token: string | undefined, clerkOrgId: string, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [orgId, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (orgId !== clerkOrgId || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(signature, mac(`${orgId}.${expRaw}`));
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

export function joinCodesMatch(input: string, expected: string | null): boolean {
  if (!expected) return false;
  const normalized = normalizeJoinCode(input);
  if (!normalized) return false;
  return safeEqual(normalized, normalizeJoinCode(expected));
}
```

- [ ] **Step 4: Implement `lib/services/join-attempt.service.ts`**

```ts
import { prisma } from "@/lib/prisma";

/**
 * Sliding-window limit on wrong access codes, backed by Mongo because
 * serverless instances share no memory. Key = "<ip>:<joinSlug>".
 */
export const JOIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 } as const;

export async function isJoinRateLimited(key: string, now = new Date()): Promise<boolean> {
  const count = await prisma.joinCodeAttempt.count({
    where: { key, createdAt: { gte: new Date(now.getTime() - JOIN_RATE_LIMIT.windowMs) } },
  });
  return count >= JOIN_RATE_LIMIT.max;
}

export async function recordFailedJoinAttempt(key: string): Promise<void> {
  await prisma.joinCodeAttempt.create({ data: { key } });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/clubs lib/services/__tests__/join-attempt.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint.** Leave uncommitted.

---

### Task 5: Club service (create, update, validate, stats, org-type guard)

**Files:**
- Create: `lib/services/club.service.ts`
- Test: `lib/services/__tests__/club.service.test.ts`

**Interfaces:**
- Consumes: `normalizeJoinCode` (Task 4), `getOrgType` (Task 1), `stripe` from `@/lib/stripe`, `clerkClient` from `@clerk/nextjs/server`.
- Produces:
  - `interface ClubInput { name: string; joinSlug: string; joinCode: string; trialDays: number; stripePriceId: string; starterProgramIds: string[] }`
  - `class ClubError extends Error { code: ClubErrorCode }` with `ClubErrorCode = "invalid_input" | "slug_taken" | "price_invalid" | "starter_invalid" | "has_clients" | "not_found"`
  - `parseClubInput(raw: Record<string, unknown>): ClubInput` (throws `ClubError("invalid_input", message)`)
  - `getClubBySlug(joinSlug: string): Promise<Organization | null>`: only returns orgs whose `getOrgType` is CLUB
  - `createClub(input: ClubInput): Promise<Organization>`
  - `updateClub(clerkOrgId: string, input: ClubInput): Promise<Organization>`
  - `setOrgType(clerkOrgId: string, type: OrgType): Promise<void>`: throws `has_clients` if any CLIENT user is in the org
  - `listClubsWithStats(): Promise<ClubStats[]>` where `ClubStats = { org: Organization; members: number; trialing: number; paying: number; conversionRate: number | null }`
  - `getPlatformStaffUser(): Promise<User>`: TRAINER user with `PLATFORM_STAFF_EMAIL`, throws if missing

- [ ] **Step 1: Write the failing test**

`lib/services/__tests__/club.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  createOrganization: vi.fn(async () => ({ id: "org_new" })),
  deleteOrganization: vi.fn(async () => ({})),
  updateOrganization: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ organizations: clerkMocks })),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { prices: { retrieve: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    program: { findMany: vi.fn() },
    user: { count: vi.fn(), findFirst: vi.fn() },
    memberSubscription: { groupBy: vi.fn(), updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  parseClubInput, createClub, updateClub, setOrgType, getClubBySlug, ClubError,
} from "../club.service";

const valid = {
  name: "Pine Valley CC", joinSlug: "pine-valley", joinCode: "pinevalley24",
  trialDays: "14", stripePriceId: "price_123", starterProgramIds: ["p1", "p2"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);
  vi.mocked(stripe.prices.retrieve).mockResolvedValue({ active: true, recurring: { interval: "month" } } as any);
  vi.mocked(prisma.program.findMany).mockResolvedValue([
    { id: "p1", isGlobal: true, schedulingType: null },
    { id: "p2", isGlobal: true, schedulingType: "SCHEDULED" },
  ] as any);
  vi.mocked(prisma.organization.create).mockImplementation(async ({ data }: any) => ({ id: "db1", ...data }));
});

describe("parseClubInput", () => {
  it("normalizes a valid form", () => {
    expect(parseClubInput(valid)).toEqual({
      name: "Pine Valley CC", joinSlug: "pine-valley", joinCode: "PINEVALLEY24",
      trialDays: 14, stripePriceId: "price_123", starterProgramIds: ["p1", "p2"],
    });
  });
  it.each([
    ["empty name", { name: " " }],
    ["bad slug", { joinSlug: "Pine Valley!" }],
    ["short code", { joinCode: "ab" }],
    ["zero trial", { trialDays: "0" }],
    ["huge trial", { trialDays: "400" }],
    ["non-price id", { stripePriceId: "prod_1" }],
    ["no starters", { starterProgramIds: [] }],
  ])("rejects %s", (_l, patch) => {
    expect(() => parseClubInput({ ...valid, ...patch })).toThrow(ClubError);
  });
});

describe("createClub", () => {
  it("creates the Clerk org without createdBy and a CLUB row", async () => {
    const org = await createClub(parseClubInput(valid));
    expect(clerkMocks.createOrganization).toHaveBeenCalledWith({ name: "Pine Valley CC", maxAllowedMemberships: 0 });
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clerkOrgId: "org_new", type: "CLUB", joinSlug: "pine-valley", trialDays: 14 }),
    });
    expect(org.type).toBe("CLUB");
  });
  it("refuses a taken slug before touching Clerk", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue({ id: "x" } as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "slug_taken" });
    expect(clerkMocks.createOrganization).not.toHaveBeenCalled();
  });
  it("refuses a non-recurring or inactive price", async () => {
    vi.mocked(stripe.prices.retrieve).mockResolvedValue({ active: true, recurring: null } as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "price_invalid" });
  });
  it("refuses starters that are not scheduled global programs", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "p1", isGlobal: true, schedulingType: "ON_DEMAND" },
      { id: "p2", isGlobal: true, schedulingType: null },
    ] as any);
    await expect(createClub(parseClubInput(valid))).rejects.toMatchObject({ code: "starter_invalid" });
  });
  it("deletes the Clerk org if the DB write fails", async () => {
    vi.mocked(prisma.organization.create).mockRejectedValue(new Error("db down"));
    await expect(createClub(parseClubInput(valid))).rejects.toThrow("db down");
    expect(clerkMocks.deleteOrganization).toHaveBeenCalledWith("org_new");
  });
});

describe("updateClub", () => {
  it("does not touch existing members' trials", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ clerkOrgId: "org_1", type: "CLUB", joinSlug: "pine-valley" } as any);
    vi.mocked(prisma.organization.update).mockResolvedValue({} as any);
    await updateClub("org_1", parseClubInput({ ...valid, trialDays: "30" }));
    expect(prisma.memberSubscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_1" },
      data: expect.objectContaining({ trialDays: 30 }),
    });
  });
});

describe("setOrgType", () => {
  it("refuses when the org has clients", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(3);
    await expect(setOrgType("org_1", "TRAINER")).rejects.toMatchObject({ code: "has_clients" });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
  it("changes the type of an empty org", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    await setOrgType("org_1", "CLUB");
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { clerkOrgId: "org_1" }, data: { type: "CLUB" } });
  });
});

describe("getClubBySlug", () => {
  it("ignores non-club orgs", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ joinSlug: "x", type: null } as any);
    expect(await getClubBySlug("x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/services/__tests__/club.service.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/services/club.service.ts`**

```ts
import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, OrgType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getOrgType } from "@/lib/org-capabilities";
import { normalizeJoinCode } from "@/lib/clubs/join-token";
import { getProgramSchedulingType } from "@/lib/services/program.service";

export type ClubErrorCode =
  | "invalid_input" | "slug_taken" | "price_invalid" | "starter_invalid" | "has_clients" | "not_found";

export class ClubError extends Error {
  constructor(public code: ClubErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ClubError";
  }
}

export interface ClubInput {
  name: string;
  joinSlug: string;
  joinCode: string;
  trialDays: number;
  stripePriceId: string;
  starterProgramIds: string[];
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseClubInput(raw: Record<string, unknown>): ClubInput {
  const name = String(raw.name ?? "").trim();
  const joinSlug = String(raw.joinSlug ?? "").trim().toLowerCase();
  const joinCode = normalizeJoinCode(String(raw.joinCode ?? ""));
  const trialDays = Number(raw.trialDays);
  const stripePriceId = String(raw.stripePriceId ?? "").trim();
  const starterProgramIds = Array.isArray(raw.starterProgramIds)
    ? raw.starterProgramIds.map(String).filter(Boolean)
    : [];

  if (!name || name.length > 120) throw new ClubError("invalid_input", "Name is required (max 120 chars).");
  if (!SLUG_RE.test(joinSlug) || joinSlug.length > 60)
    throw new ClubError("invalid_input", "Join link may use lowercase letters, numbers and dashes.");
  if (!/^[A-Z0-9-]{4,32}$/.test(joinCode))
    throw new ClubError("invalid_input", "Access code must be 4–32 letters, numbers or dashes.");
  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365)
    throw new ClubError("invalid_input", "Trial must be 1–365 days.");
  if (!stripePriceId.startsWith("price_"))
    throw new ClubError("invalid_input", "Stripe price id must start with price_.");
  if (starterProgramIds.length === 0 || new Set(starterProgramIds).size !== starterProgramIds.length)
    throw new ClubError("invalid_input", "Pick at least one starter program (no duplicates).");

  return { name, joinSlug, joinCode, trialDays, stripePriceId, starterProgramIds };
}

async function assertSlugFree(joinSlug: string, exceptClerkOrgId?: string) {
  const clash = await prisma.organization.findFirst({
    where: { joinSlug, ...(exceptClerkOrgId ? { clerkOrgId: { not: exceptClerkOrgId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ClubError("slug_taken", "That join link is already used by another club.");
}

async function assertPrice(stripePriceId: string) {
  try {
    const price = await stripe.prices.retrieve(stripePriceId);
    if (!price.active || !price.recurring) throw new Error("not an active recurring price");
  } catch {
    throw new ClubError("price_invalid", "Stripe price must exist, be active and recurring.");
  }
}

async function assertStarters(ids: string[]) {
  const programs = await prisma.program.findMany({
    where: { id: { in: ids } },
    select: { id: true, isGlobal: true, schedulingType: true },
  });
  const ok =
    programs.length === ids.length &&
    programs.every((p) => p.isGlobal && getProgramSchedulingType(p) === "SCHEDULED");
  if (!ok) throw new ClubError("starter_invalid", "Starter programs must be scheduled Global Programs.");
}

function clubData(input: ClubInput) {
  return {
    name: input.name,
    joinSlug: input.joinSlug,
    joinCode: input.joinCode,
    trialDays: input.trialDays,
    stripePriceId: input.stripePriceId,
    starterProgramIds: input.starterProgramIds,
  };
}

/**
 * Creates the Clerk org and its CLUB row. No `createdBy`: that would make the
 * admin a member, and the organizationMembership.created webhook would then
 * move the admin's own DB user into the club.
 */
export async function createClub(input: ClubInput): Promise<Organization> {
  await assertSlugFree(input.joinSlug);
  await assertPrice(input.stripePriceId);
  await assertStarters(input.starterProgramIds);

  const client = await clerkClient();
  // 0 = no membership cap on this org. Confirm the Clerk plan allows it.
  const clerkOrg = await client.organizations.createOrganization({ name: input.name, maxAllowedMemberships: 0 });
  try {
    return await prisma.organization.create({
      data: { clerkOrgId: clerkOrg.id, type: "CLUB", ...clubData(input) },
    });
  } catch (err) {
    await client.organizations.deleteOrganization(clerkOrg.id).catch(() => {});
    throw err;
  }
}

/** Edits apply to future joiners only; existing trials keep their end date. */
export async function updateClub(clerkOrgId: string, input: ClubInput): Promise<Organization> {
  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org || getOrgType(org) !== "CLUB") throw new ClubError("not_found");
  await assertSlugFree(input.joinSlug, clerkOrgId);
  await assertPrice(input.stripePriceId);
  await assertStarters(input.starterProgramIds);
  if (org.name !== input.name) {
    const client = await clerkClient();
    await client.organizations.updateOrganization(clerkOrgId, { name: input.name });
  }
  return prisma.organization.update({ where: { clerkOrgId }, data: clubData(input) });
}

/** Type is fixed once the org has clients: switching would break who is billed. */
export async function setOrgType(clerkOrgId: string, type: OrgType): Promise<void> {
  const clients = await prisma.user.count({ where: { clerkOrgId, role: "CLIENT" } });
  if (clients > 0) throw new ClubError("has_clients", "Org type can't change once it has clients.");
  await prisma.organization.update({ where: { clerkOrgId }, data: { type } });
}

export async function getClubBySlug(joinSlug: string): Promise<Organization | null> {
  const org = await prisma.organization.findUnique({ where: { joinSlug } });
  return org && getOrgType(org) === "CLUB" ? org : null;
}

export interface ClubStats {
  org: Organization;
  members: number;
  trialing: number;
  paying: number;
  /** paying / (members who are past their trial or paying); null when nobody is. */
  conversionRate: number | null;
}

export async function listClubsWithStats(): Promise<ClubStats[]> {
  const orgs = await prisma.organization.findMany({ where: { type: "CLUB" }, orderBy: { createdAt: "desc" } });
  const groups = await prisma.memberSubscription.groupBy({
    by: ["clerkOrgId", "status"],
    where: { clerkOrgId: { in: orgs.map((o) => o.clerkOrgId) } },
    _count: { _all: true },
  });
  return orgs.map((org) => {
    const rows = groups.filter((g) => g.clerkOrgId === org.clerkOrgId);
    const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    const members = rows.reduce((n, r) => n + r._count._all, 0);
    const trialing = count("TRIALING");
    const paying = count("ACTIVE") + count("PAST_DUE");
    const decided = members - trialing;
    return { org, members, trialing, paying, conversionRate: decided > 0 ? paying / decided : null };
  });
}

/** The TRAINER user that owns every club program copy (env PLATFORM_STAFF_EMAIL). */
export async function getPlatformStaffUser(): Promise<User> {
  const email = process.env.PLATFORM_STAFF_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("PLATFORM_STAFF_EMAIL is not set");
  const user = await prisma.user.findFirst({ where: { email, role: "TRAINER" } });
  if (!user) throw new Error(`Platform staff user ${email} not found (must be a TRAINER)`);
  return user;
}
```

Before relying on it, check that `getProgramSchedulingType` is exported from `lib/services/program.service.ts` (it is used in `duplicateProgram`). If it lives in another module, import it from there. Its argument only needs `schedulingType`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/services/__tests__/club.service.test.ts && npx tsc --noEmit`
Expected: PASS. If tsc rejects the Prisma `where: { type: "CLUB" }` filter on an optional enum, keep it (Prisma supports equality on optional enums).

- [ ] **Step 5: Checkpoint.** Leave uncommitted.

---

### Task 6: Member enrollment and starter programs

**Files:**
- Create: `lib/clubs/starter-progression.ts`
- Create: `lib/services/club-member.service.ts`
- Test: `lib/clubs/__tests__/starter-progression.test.ts`
- Test: `lib/services/__tests__/club-member.service.test.ts`

**Interfaces:**
- Consumes: `getPlatformStaffUser` (Task 5), `duplicateProgram`, `assignProgram` (`lib/services/program.service.ts`), `getOrgType` (Task 1).
- Produces:
  - `nextStarterTemplateId(starterIds: string[], assignedSourceIds: string[]): string | null`
  - `OPEN_SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS"]`
  - `type EnrollResult = { ok: true; userId: string } | { ok: false; reason: "other_account" }`
  - `enrollClubMember(args: { clerkUserId: string; club: Organization }): Promise<EnrollResult>`
  - `ensureMemberSubscription(userId: string, club: Organization, now?: Date): Promise<void>`: create-once, never resets the trial
  - `type StarterOutcome = "assigned" | "in_progress" | "done" | "skipped"`
  - `assignNextStarterProgram(userId: string): Promise<StarterOutcome>`: marks `starterStatus` FAILED and rethrows on error
  - `sweepClubStarterPrograms(now?: Date): Promise<{ processed: number; assigned: number; failed: number }>`

- [ ] **Step 1: Write the failing pure test**

`lib/clubs/__tests__/starter-progression.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextStarterTemplateId } from "@/lib/clubs/starter-progression";

describe("nextStarterTemplateId", () => {
  it("returns the first template in club order not yet assigned", () => {
    expect(nextStarterTemplateId(["a", "b", "c"], [])).toBe("a");
    expect(nextStarterTemplateId(["a", "b", "c"], ["a"])).toBe("b");
    expect(nextStarterTemplateId(["a", "b", "c"], ["b", "a"])).toBe("c");
  });
  it("returns null when everything was assigned", () => {
    expect(nextStarterTemplateId(["a", "b"], ["a", "b"])).toBeNull();
    expect(nextStarterTemplateId([], [])).toBeNull();
  });
  it("ignores assignments of templates no longer on the list", () => {
    expect(nextStarterTemplateId(["b"], ["a"])).toBe("b");
  });
});
```

- [ ] **Step 2: Implement `lib/clubs/starter-progression.ts` and run the test**

```ts
/**
 * Club members work through the club's starter list in order. A program copy
 * remembers its template in `Program.sourceTemplateId`, so "already assigned"
 * is the set of those ids on the member's programs.
 */
export function nextStarterTemplateId(starterIds: string[], assignedSourceIds: string[]): string | null {
  const assigned = new Set(assignedSourceIds);
  return starterIds.find((id) => !assigned.has(id)) ?? null;
}

/**
 * A program is finished when none of its sessions are still open. Programs are
 * never marked COMPLETED in this codebase; stale SCHEDULED sessions become
 * MISSED via the mark-missed-sessions cron.
 */
export const OPEN_SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;
```

Run: `npx vitest run lib/clubs/__tests__/starter-progression.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing service test**

`lib/services/__tests__/club-member.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    id: "clerk_1", firstName: "Sam", lastName: "Lee", imageUrl: "",
    primaryEmailAddressId: "e1", emailAddresses: [{ id: "e1", emailAddress: "sam@example.com" }],
  })),
  getOrganizationMembershipList: vi.fn(async () => ({ data: [] })),
  createOrganizationMembership: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: { getUser: clerkMocks.getUser, getOrganizationMembershipList: clerkMocks.getOrganizationMembershipList },
    organizations: { createOrganizationMembership: clerkMocks.createOrganizationMembership },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    organization: { findUnique: vi.fn() },
    memberSubscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    program: { findMany: vi.fn() },
    workoutSessionV2: { count: vi.fn() },
  },
}));
vi.mock("@/lib/services/program.service", () => ({
  duplicateProgram: vi.fn(async () => ({ id: "copy1" })),
  assignProgram: vi.fn(async () => ({})),
}));
vi.mock("@/lib/services/club.service", () => ({
  getPlatformStaffUser: vi.fn(async () => ({ id: "staff1" })),
}));

import { prisma } from "@/lib/prisma";
import { duplicateProgram, assignProgram } from "@/lib/services/program.service";
import {
  enrollClubMember, ensureMemberSubscription, assignNextStarterProgram,
} from "../club-member.service";

const club = {
  clerkOrgId: "org_club", type: "CLUB", trialDays: 14, starterProgramIds: ["t1", "t2"],
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "u1" } as any);
  vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue(null);
});

describe("enrollClubMember", () => {
  it("creates the CLIENT, Clerk membership and a trial", async () => {
    const res = await enrollClubMember({ clerkUserId: "clerk_1", club });
    expect(res).toEqual({ ok: true, userId: "u1" });
    expect(clerkMocks.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_club", userId: "clerk_1", role: "org:member",
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ role: "CLIENT", clerkOrgId: "org_club", email: "sam@example.com" }),
    }));
    expect(prisma.memberSubscription.create).toHaveBeenCalled();
  });

  it("refuses a trainer or another org's client and changes nothing", async () => {
    for (const existing of [
      { id: "u9", role: "TRAINER", clerkOrgId: "org_trainer" },
      { id: "u9", role: "CLIENT", clerkOrgId: "org_other" },
    ]) {
      vi.clearAllMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existing as any);
      expect(await enrollClubMember({ clerkUserId: "clerk_1", club })).toEqual({ ok: false, reason: "other_account" });
      expect(clerkMocks.createOrganizationMembership).not.toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
      expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
    }
  });

  it("is idempotent for someone already in this club", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "CLIENT", clerkOrgId: "org_club" } as any);
    clerkMocks.getOrganizationMembershipList.mockResolvedValueOnce({ data: [{ organization: { id: "org_club" } }] } as any);
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ id: "ms1" } as any);
    expect(await enrollClubMember({ clerkUserId: "clerk_1", club })).toEqual({ ok: true, userId: "u1" });
    expect(clerkMocks.createOrganizationMembership).not.toHaveBeenCalled();
    expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
  });
});

describe("ensureMemberSubscription", () => {
  it("starts the trial from now + trialDays", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    await ensureMemberSubscription("u1", club, now);
    expect(prisma.memberSubscription.create).toHaveBeenCalledWith({
      data: { userId: "u1", clerkOrgId: "org_club", status: "TRIALING", trialEndsAt: new Date("2026-10-15T00:00:00Z") },
    });
  });
  it("never resets an existing trial", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ id: "ms1" } as any);
    await ensureMemberSubscription("u1", club);
    expect(prisma.memberSubscription.create).not.toHaveBeenCalled();
  });
  it("tolerates a concurrent create (unique violation)", async () => {
    vi.mocked(prisma.memberSubscription.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(ensureMemberSubscription("u1", club)).resolves.toBeUndefined();
  });
});

describe("assignNextStarterProgram", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "CLIENT", clerkOrgId: "org_club" } as any);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(club);
  });

  it("copies then assigns the first template for a new member", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    expect(await assignNextStarterProgram("u1")).toBe("assigned");
    expect(duplicateProgram).toHaveBeenCalledWith("t1", "staff1", false);
    expect(assignProgram).toHaveBeenCalledWith("copy1", "u1", expect.any(Date));
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "ASSIGNED" } });
  });

  it("waits while the current starter still has open sessions", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([{ id: "c1", sourceTemplateId: "t1" }] as any);
    vi.mocked(prisma.workoutSessionV2.count).mockResolvedValue(2);
    expect(await assignNextStarterProgram("u1")).toBe("in_progress");
    expect(duplicateProgram).not.toHaveBeenCalled();
  });

  it("moves on to the next template once the current one is finished", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([{ id: "c1", sourceTemplateId: "t1" }] as any);
    vi.mocked(prisma.workoutSessionV2.count).mockResolvedValue(0);
    expect(await assignNextStarterProgram("u1")).toBe("assigned");
    expect(duplicateProgram).toHaveBeenCalledWith("t2", "staff1", false);
  });

  it("reports done when the list is exhausted", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([
      { id: "c1", sourceTemplateId: "t1" }, { id: "c2", sourceTemplateId: "t2" },
    ] as any);
    vi.mocked(prisma.workoutSessionV2.count).mockResolvedValue(0);
    expect(await assignNextStarterProgram("u1")).toBe("done");
  });

  it("marks FAILED and rethrows when the copy fails", async () => {
    vi.mocked(prisma.program.findMany).mockResolvedValue([]);
    vi.mocked(duplicateProgram).mockRejectedValueOnce(new Error("clone aborted"));
    await expect(assignNextStarterProgram("u1")).rejects.toThrow("clone aborted");
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { starterStatus: "FAILED" } });
  });

  it("skips users who are not in a club", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...club, type: null });
    expect(await assignNextStarterProgram("u1")).toBe("skipped");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run lib/services/__tests__/club-member.service.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement `lib/services/club-member.service.ts`**

```ts
import { clerkClient } from "@clerk/nextjs/server";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { duplicateProgram, assignProgram } from "@/lib/services/program.service";
import { getPlatformStaffUser } from "@/lib/services/club.service";
import { getOrgType } from "@/lib/org-capabilities";
import { nextStarterTemplateId, OPEN_SESSION_STATUSES } from "@/lib/clubs/starter-progression";

const DAY_MS = 24 * 60 * 60 * 1000;

export type EnrollResult = { ok: true; userId: string } | { ok: false; reason: "other_account" };

/**
 * Adds a freshly signed-up (or returning) Clerk user to a club: Clerk
 * membership, CLIENT row, trial. Runs synchronously on /join/[slug]/complete so
 * the member never lands in the app before their row exists. Safe to repeat.
 *
 * A person belongs to exactly one org (User.clerkOrgId), so anyone already
 * attached elsewhere — a trainer, or a client of another org — is refused and
 * nothing is changed.
 */
export async function enrollClubMember(args: { clerkUserId: string; club: Organization }): Promise<EnrollResult> {
  const { clerkUserId, club } = args;
  const existing = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  if (existing && (existing.role === "TRAINER" || (existing.clerkOrgId && existing.clerkOrgId !== club.clerkOrgId))) {
    return { ok: false, reason: "other_account" };
  }

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });
  const alreadyMember = memberships.data.some((m) => m.organization.id === club.clerkOrgId);
  if (!alreadyMember) {
    await client.organizations.createOrganizationMembership({
      organizationId: club.clerkOrgId,
      userId: clerkUserId,
      role: "org:member",
    });
  }

  const clerkUser = await client.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error(`Clerk user ${clerkUserId} has no email`);

  const user = await prisma.user.upsert({
    where: { clerkId: clerkUserId },
    update: { clerkOrgId: club.clerkOrgId },
    create: {
      clerkId: clerkUserId,
      email,
      firstName: clerkUser.firstName ?? "",
      lastName: clerkUser.lastName ?? "",
      imageUrl: clerkUser.imageUrl,
      role: "CLIENT",
      clerkOrgId: club.clerkOrgId,
      onboarded: false,
    },
  });

  await ensureMemberSubscription(user.id, club);
  return { ok: true, userId: user.id };
}

/** Creates the trial once. Never resets `trialEndsAt` for an existing row. */
export async function ensureMemberSubscription(userId: string, club: Organization, now = new Date()): Promise<void> {
  const existing = await prisma.memberSubscription.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return;
  const trialDays = club.trialDays ?? 14;
  try {
    await prisma.memberSubscription.create({
      data: {
        userId,
        clerkOrgId: club.clerkOrgId,
        status: "TRIALING",
        trialEndsAt: new Date(now.getTime() + trialDays * DAY_MS),
      },
    });
  } catch (err) {
    // A concurrent enrollment (double submit / webhook) won the unique race.
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
}

export type StarterOutcome = "assigned" | "in_progress" | "done" | "skipped";

/**
 * Gives a member their next starter program if their current one is finished.
 * Copy first, then assign — `assignProgram` mutates the program it is given, so
 * a template must never be assigned directly.
 */
export async function assignNextStarterProgram(userId: string): Promise<StarterOutcome> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.clerkOrgId || user.role !== "CLIENT") return "skipped";
  const club = await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  if (!club || getOrgType(club) !== "CLUB") return "skipped";

  try {
    const copies = await prisma.program.findMany({
      where: { clientId: userId, sourceTemplateId: { in: club.starterProgramIds } },
      select: { id: true, sourceTemplateId: true },
    });

    if (copies.length > 0) {
      const open = await prisma.workoutSessionV2.count({
        where: {
          clientId: userId,
          status: { in: [...OPEN_SESSION_STATUSES] },
          workout: { programId: { in: copies.map((c) => c.id) } },
        },
      });
      if (open > 0) return "in_progress";
    }

    const next = nextStarterTemplateId(
      club.starterProgramIds,
      copies.map((c) => c.sourceTemplateId).filter((id): id is string => Boolean(id))
    );
    if (!next) {
      await prisma.memberSubscription.update({ where: { userId }, data: { starterStatus: "ASSIGNED" } });
      return "done";
    }

    const staff = await getPlatformStaffUser();
    const copy = await duplicateProgram(next, staff.id, false);
    await assignProgram(copy.id, userId, new Date());
    await prisma.memberSubscription.update({ where: { userId }, data: { starterStatus: "ASSIGNED" } });
    return "assigned";
  } catch (err) {
    await prisma.memberSubscription
      .update({ where: { userId }, data: { starterStatus: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}

/** How many members are processed per sweep run (each may clone for ~20s). */
const SWEEP_BATCH = 5;
/** Leave freshly-joined members to the `after()` job for a moment. */
const PENDING_GRACE_MS = 2 * 60 * 1000;

/**
 * Cron body: retries PENDING/FAILED first assignments and advances members
 * whose current starter program is finished. Idempotent.
 */
export async function sweepClubStarterPrograms(now = new Date()) {
  const subs = await prisma.memberSubscription.findMany({
    where: {
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [
        { starterStatus: { in: ["PENDING", "FAILED"] }, updatedAt: { lt: new Date(now.getTime() - PENDING_GRACE_MS) } },
        { starterStatus: "ASSIGNED" },
      ],
    },
    select: { userId: true },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });

  let assigned = 0;
  let failed = 0;
  for (let i = 0; i < subs.length; i += SWEEP_BATCH) {
    const results = await Promise.allSettled(subs.slice(i, i + SWEEP_BATCH).map((s) => assignNextStarterProgram(s.userId)));
    for (const r of results) {
      if (r.status === "rejected") failed += 1;
      else if (r.value === "assigned") assigned += 1;
    }
  }
  return { processed: subs.length, assigned, failed };
}
```

Note for the implementer: `nextStarterTemplateId` returning null with a finished list sets ASSIGNED (not a new status), so the sweep keeps checking cheaply. If admin later appends a template, the member gets it on the next sweep.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/clubs lib/services/__tests__/club-member.service.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 7: Checkpoint.** Leave uncommitted.

---

### Task 7: Join pages, onboarding fix and Clerk webhook backup

**Files:**
- Create: `actions/club-join-actions.ts`
- Create: `app/join/[slug]/page.tsx`, `app/join/[slug]/join-code-form.tsx`
- Create: `app/join/[slug]/complete/page.tsx`, `app/join/[slug]/complete/activate-org.tsx`
- Modify: `lib/auth/public-routes.ts` (add `"/join/(.*)"`)
- Modify: `actions/onboarding-actions.ts:137-160` (don't null `clerkOrgId`)
- Modify: `app/api/webhooks/clerk/route.ts:127-189` (club branch)
- Test: `actions/__tests__/club-join-actions.test.ts`
- Test: extend `app/api/webhooks/clerk/__tests__/route.test.ts`
- Test: the existing public-routes test if present (`grep -rl PUBLIC_ROUTES lib app --include=*.test.ts`); otherwise add `lib/auth/__tests__/public-routes-join.test.ts`

**Interfaces:**
- Consumes: `getClubBySlug` (Task 5), `joinCodesMatch`, `signJoinToken`, `verifyJoinToken`, `JOIN_COOKIE` (Task 4), `isJoinRateLimited`, `recordFailedJoinAttempt` (Task 4), `enrollClubMember`, `ensureMemberSubscription`, `assignNextStarterProgram` (Task 6), `getOrgBranding`, `toViewModel`, `BrandStyle`, `OrgIdentity` (existing branding).
- Produces: `verifyJoinCodeAction(slug: string, code: string): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing action test**

`actions/__tests__/club-join-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const cookieStore = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
  headers: vi.fn(async () => new Map([["x-forwarded-for", "1.2.3.4, 10.0.0.1"]])),
}));
vi.mock("@/lib/services/club.service", () => ({ getClubBySlug: vi.fn() }));
vi.mock("@/lib/services/join-attempt.service", () => ({
  isJoinRateLimited: vi.fn(async () => false),
  recordFailedJoinAttempt: vi.fn(),
}));

import { getClubBySlug } from "@/lib/services/club.service";
import { isJoinRateLimited, recordFailedJoinAttempt } from "@/lib/services/join-attempt.service";
import { verifyJoinCodeAction } from "../club-join-actions";

beforeAll(() => { process.env.CLUB_JOIN_SECRET = "test-secret-test-secret-test-secret-xx"; });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club", joinCode: "PINE24" } as any);
});

const GENERIC = "That code didn't work. Check with your club and try again.";

describe("verifyJoinCodeAction", () => {
  it("sets the join cookie on the right code", async () => {
    expect(await verifyJoinCodeAction("pine", " pine24 ")).toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith("club_join", expect.stringMatching(/^org_club\./),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 1800 }));
  });
  it("records a failure and returns a generic error on the wrong code", async () => {
    expect(await verifyJoinCodeAction("pine", "nope")).toEqual({ ok: false, error: GENERIC });
    expect(recordFailedJoinAttempt).toHaveBeenCalledWith("1.2.3.4:pine");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
  it("gives the same generic error for an unknown club", async () => {
    vi.mocked(getClubBySlug).mockResolvedValue(null);
    expect(await verifyJoinCodeAction("ghost", "PINE24")).toEqual({ ok: false, error: GENERIC });
  });
  it("refuses even the right code when rate limited", async () => {
    vi.mocked(isJoinRateLimited).mockResolvedValue(true);
    const res = await verifyJoinCodeAction("pine", "PINE24");
    expect(res.ok).toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement `actions/club-join-actions.ts`**

```ts
"use server";

import { cookies, headers } from "next/headers";
import { getClubBySlug } from "@/lib/services/club.service";
import { isJoinRateLimited, recordFailedJoinAttempt } from "@/lib/services/join-attempt.service";
import { JOIN_COOKIE, JOIN_TOKEN_TTL_MS, joinCodesMatch, signJoinToken } from "@/lib/clubs/join-token";

const GENERIC_ERROR = "That code didn't work. Check with your club and try again.";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Step 1 of joining a club. Unknown club and wrong code give the same message
 * so the page can't be used to discover which clubs exist.
 */
export async function verifyJoinCodeAction(
  slug: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = `${await clientIp()}:${slug}`;
  if (await isJoinRateLimited(key)) {
    return { ok: false, error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  const club = await getClubBySlug(slug);
  if (!club || !joinCodesMatch(code, club.joinCode)) {
    await recordFailedJoinAttempt(key);
    return { ok: false, error: GENERIC_ERROR };
  }

  (await cookies()).set(JOIN_COOKIE, signJoinToken(club.clerkOrgId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/join",
    maxAge: JOIN_TOKEN_TTL_MS / 1000,
  });
  return { ok: true };
}
```

Run: `npx vitest run actions/__tests__/club-join-actions.test.ts`
Expected: PASS.

- [ ] **Step 3: Make `/join/*` public**

In `lib/auth/public-routes.ts` add, after `"/p/(.*)"`:

```ts
  // Club join pages: the code form and Clerk sign-up render before any
  // session exists. /join/<slug>/complete checks auth itself.
  "/join/(.*)",
```

If a public-routes test exists, add a case asserting `/join/pine-valley` and `/join/pine-valley/complete` are public. If none exists, create `lib/auth/__tests__/public-routes-join.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTES } from "@/lib/auth/public-routes";

const isPublic = createRouteMatcher([...PUBLIC_ROUTES]);
const req = (path: string) => ({ nextUrl: new URL(`https://x.test${path}`) }) as any;

describe("club join routes", () => {
  it("are public", () => {
    expect(isPublic(req("/join/pine-valley"))).toBe(true);
    expect(isPublic(req("/join/pine-valley/complete"))).toBe(true);
  });
  it("don't open unrelated routes", () => {
    expect(isPublic(req("/joined"))).toBe(false);
  });
});
```

(If `createRouteMatcher` needs a different request shape in this Clerk version, copy the shape from an existing test that uses it: `grep -rn createRouteMatcher --include=*.test.ts .`.)

- [ ] **Step 4: Build the join page**

`app/join/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import { getClubBySlug } from "@/lib/services/club.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { JoinCodeForm } from "./join-code-form";

export default async function JoinClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const branding = await getOrgBranding(club.clerkOrgId);
  const verified = verifyJoinToken((await cookies()).get(JOIN_COOKIE)?.value, club.clerkOrgId);
  const completeUrl = `/join/${slug}/complete`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[oklch(0.97_0.005_247)] px-4 py-12">
      <BrandStyle branding={branding} />
      <OrgIdentity branding={toViewModel(branding)} surface="light" />
      {verified ? (
        <SignUp
          routing="hash"
          forceRedirectUrl={completeUrl}
          signInForceRedirectUrl={completeUrl}
        />
      ) : (
        <JoinCodeForm slug={slug} clubName={branding.displayName} />
      )}
    </div>
  );
}
```

`app/join/[slug]/join-code-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyJoinCodeAction } from "@/actions/club-join-actions";

export function JoinCodeForm({ slug, clubName }: { slug: string; clubName: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await verifyJoinCodeAction(slug, code);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join {clubName}</CardTitle>
        <CardDescription>Enter the access code your club gave you to start your free trial.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-code">Access code</Label>
            <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value)}
              autoComplete="off" autoCapitalize="characters" required />
          </div>
          {error && <p className="text-sm text-danger-foreground" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending || !code.trim()}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

Check that `components/ui/input.tsx`, `label.tsx` and `card.tsx` export these names (`ls components/ui`), and adjust the imports to match.

- [ ] **Step 5: Build the completion page**

`app/join/[slug]/complete/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { getClubBySlug } from "@/lib/services/club.service";
import { enrollClubMember, assignNextStarterProgram } from "@/lib/services/club-member.service";
import { JOIN_COOKIE, verifyJoinToken } from "@/lib/clubs/join-token";
import { ActivateOrg } from "./activate-org";

export default async function JoinCompletePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) notFound();

  const { userId } = await auth();
  if (!userId) redirect(`/join/${slug}`);

  const token = (await cookies()).get(JOIN_COOKIE)?.value;
  if (!verifyJoinToken(token, club.clerkOrgId)) redirect(`/join/${slug}`);

  const result = await enrollClubMember({ clerkUserId: userId, club });
  if (!result.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-xl font-semibold text-foreground">This email is already linked to another account</h1>
          <p className="text-sm text-muted-foreground">
            Sign out and join with a different email, or contact support if you think this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  // Copying a program can take ~20s — don't hold the page. The
  // club-starter-programs cron retries anything that fails here.
  const memberId = result.userId;
  after(async () => {
    try {
      await assignNextStarterProgram(memberId);
    } catch (err) {
      console.error("Starter program assignment failed (background):", err);
    }
  });

  // The cookie can't be cleared in a server component; it expires in ≤30 min
  // and is only valid for this club, so leaving it is harmless.
  return <ActivateOrg organizationId={club.clerkOrgId} />;
}
```

`app/join/[slug]/complete/activate-org.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

/**
 * Makes the club the session's active org (so `auth().orgId` matches, like an
 * invited client) and moves on to client onboarding.
 */
export function ActivateOrg({ organizationId }: { organizationId: string }) {
  const { isLoaded, setActive } = useOrganizationList();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    setActive({ organization: organizationId })
      .catch((err) => console.error("setActive failed:", err))
      .finally(() => router.replace("/onboarding/client"));
  }, [isLoaded, setActive, organizationId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Setting up your account…
    </div>
  );
}
```

Clerk v7 changed some hooks to be signal-based (see the self-serve funnel notes). Before writing this, check the `useOrganizationList` return shape in `node_modules/@clerk/nextjs` / `@clerk/shared` types. If `setActive` moved, use the `useClerk().setActive({ organization })` equivalent.

- [ ] **Step 6: Fix the onboarding clobber**

In `actions/onboarding-actions.ts` `completeClientOnboarding`, in the `update:` branch of `prisma.user.upsert`, change:

```ts
      clerkOrgId: orgId ?? null,
```

to:

```ts
      // Keep the stored org when the session has no active org — club members
      // and webhook-created clients already have the right clerkOrgId, and
      // nulling it would detach them from their org and its billing.
      ...(orgId ? { clerkOrgId: orgId } : {}),
```

Leave the `create:` branch as is. If `actions/__tests__` has a test for `completeClientOnboarding`, add a case: `auth()` returns `orgId: null` → the upsert `update` has no `clerkOrgId` key. Otherwise, create `actions/__tests__/onboarding-org-preserve.test.ts` that mocks `@clerk/nextjs/server` (`auth` → `{ userId: "c1", orgId: null }`, `currentUser` → a user with one email), `@/lib/prisma` (`user.upsert`, `clientProfile.upsert`) and `@/lib/services/audit-log.service` (`logUserAudit`), calls `completeClientOnboarding({ firstName: "A", lastName: "B" })`, and asserts `"clerkOrgId" in vi.mocked(prisma.user.upsert).mock.calls[0][0].update` is `false`. Mock any other imports the module needs, as the failing run reports them.

- [ ] **Step 7: Extend the Clerk webhook (backup path)**

In `app/api/webhooks/clerk/route.ts`, add imports:

```ts
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { ensureMemberSubscription } from "@/lib/services/club-member.service";
```

Inside `if (upserted.role === "CLIENT") {`, before the existing `try` that applies pending assignments, insert:

```ts
        // Club orgs: make sure the member has a trial even if they reached the
        // org some way other than /join/[slug]/complete. Idempotent — never
        // resets an existing trial. Best-effort like the block below.
        try {
          const org = await prisma.organization.findUnique({ where: { clerkOrgId: orgId } });
          if (org && getOrgCapabilities(org).billing === "member") {
            await ensureMemberSubscription(upserted.id, org);
          }
        } catch (error) {
          console.error("Failed to ensure member subscription:", error);
        }
```

In `app/api/webhooks/clerk/__tests__/route.test.ts`, add `findUnique: vi.fn()` to the `organization` mock, and mock `@/lib/services/club-member.service` → `{ ensureMemberSubscription: vi.fn() }`. Add two tests in the file's existing style for `organizationMembership.created`, reusing the existing membership-created fixture and `clerkClient` mock:
1. The org row has `type: "CLUB"` and the upsert returns `{ id: "u1", role: "CLIENT" }` → `ensureMemberSubscription` is called with `("u1", org)`.
2. The org row has `type: null` → `ensureMemberSubscription` is not called.

- [ ] **Step 8: Verify**

Run: `npx vitest run actions app/api/webhooks lib/auth && npx tsc --noEmit`
Expected: PASS, no new failures.

- [ ] **Step 9: Checkpoint.** Leave uncommitted.

---

### Task 8: Member billing (checkout, portal, Stripe webhook, billing page)

**Files:**
- Create: `lib/services/member-billing.service.ts`
- Create: `app/api/checkout/member/route.ts`
- Create: `app/api/stripe/member-portal/route.ts`
- Create: `app/billing/member-billing-view.tsx`
- Modify: `app/billing/page.tsx` (branch for club members)
- Modify: `app/api/stripe/webhook/route.ts`
- Test: `lib/services/__tests__/member-billing.service.test.ts`
- Test: `app/api/stripe/__tests__/webhook.member.test.ts`

**Interfaces:**
- Consumes: `getOrgForUser` (Task 1), `getOrgCapabilities` (Task 1), `trialDaysLeft` (Task 2).
- Produces:
  - `MEMBER_PURCHASE_TYPE = "member_subscription"`
  - `activateMemberFromCheckout(session: Stripe.Checkout.Session): Promise<void>`
  - `syncMemberSubscriptionFromStripe(stripeCustomerId: string, subscription: Stripe.Subscription): Promise<number>` (rows updated)
  - `markMemberCanceled(stripeCustomerId: string): Promise<number>`
  - `markMemberPastDue(stripeCustomerId: string): Promise<number>`

- [ ] **Step 1: Write the failing service test**

`lib/services/__tests__/member-billing.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { retrieve: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { memberSubscription: { updateMany: vi.fn() } } }));

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  activateMemberFromCheckout, syncMemberSubscriptionFromStripe, markMemberCanceled, markMemberPastDue,
} from "../member-billing.service";

const sub = (status: string) => ({
  id: "sub_1", status, cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1_800_000_000 }] },
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 1 });
});

describe("member billing", () => {
  it("activates by userId from checkout metadata and stores Stripe ids", async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub("active"));
    await activateMemberFromCheckout({
      customer: "cus_1", subscription: "sub_1", metadata: { purchaseType: "member_subscription", userId: "u1" },
    } as any);
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: expect.objectContaining({
        status: "ACTIVE", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
      }),
    });
  });

  it.each([
    ["active", "ACTIVE"], ["past_due", "PAST_DUE"], ["canceled", "CANCELED"], ["unpaid", "UNPAID"],
  ])("syncs stripe %s → %s by customer", async (stripeStatus, expected) => {
    await syncMemberSubscriptionFromStripe("cus_1", sub(stripeStatus));
    expect(prisma.memberSubscription.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_1" }, data: expect.objectContaining({ status: expected }),
    });
  });

  it("is a no-op (count 0) for customers that aren't members", async () => {
    vi.mocked(prisma.memberSubscription.updateMany).mockResolvedValue({ count: 0 });
    expect(await markMemberCanceled("cus_trainer")).toBe(0);
    expect(await markMemberPastDue("cus_trainer")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement `lib/services/member-billing.service.ts`**

```ts
import type Stripe from "stripe";
import type { SubStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/** Checkout metadata tag that routes a session to member (not trainer) billing. */
export const MEMBER_PURCHASE_TYPE = "member_subscription";

function toSubStatus(status: Stripe.Subscription.Status): SubStatus {
  switch (status) {
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled": return "CANCELED";
    case "unpaid": return "UNPAID";
    default: return "ACTIVE";
  }
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

/**
 * All writes are `updateMany` so events for customers we don't track as members
 * (trainers, deleted accounts) are silent no-ops instead of 500s that Stripe
 * would retry for days — same reasoning as stripe-billing.service.ts. The
 * returned count lets the webhook tell member events from trainer events.
 */
export async function activateMemberFromCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) return;
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  await prisma.memberSubscription.updateMany({
    where: { userId },
    data: {
      status: "ACTIVE",
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export async function syncMemberSubscriptionFromStripe(
  stripeCustomerId: string,
  subscription: Stripe.Subscription
): Promise<number> {
  const { count } = await prisma.memberSubscription.updateMany({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscription.id,
      status: toSubStatus(subscription.status),
      currentPeriodEnd: periodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  return count;
}

export async function markMemberCanceled(stripeCustomerId: string): Promise<number> {
  const { count } = await prisma.memberSubscription.updateMany({
    where: { stripeCustomerId }, data: { status: "CANCELED" },
  });
  return count;
}

export async function markMemberPastDue(stripeCustomerId: string): Promise<number> {
  const { count } = await prisma.memberSubscription.updateMany({
    where: { stripeCustomerId }, data: { status: "PAST_DUE" },
  });
  return count;
}
```

Run: `npx vitest run lib/services/__tests__/member-billing.service.test.ts`
Expected: PASS.

- [ ] **Step 3: Wire the Stripe webhook**

In `app/api/stripe/webhook/route.ts` import:

```ts
import {
  MEMBER_PURCHASE_TYPE, activateMemberFromCheckout, syncMemberSubscriptionFromStripe,
  markMemberCanceled, markMemberPastDue,
} from "@/lib/services/member-billing.service";
```

Changes (trainer code paths untouched):
- `checkout.session.completed`: change the final `else { await activateSubscriptionFromCheckout(session); }` to

```ts
        } else if (session.metadata?.purchaseType === MEMBER_PURCHASE_TYPE) {
          await activateMemberFromCheckout(session);
        } else {
          await activateSubscriptionFromCheckout(session);
        }
```

- `customer.subscription.created/updated`: before `syncSubscriptionFromStripe(...)` add

```ts
        // Club member? Members and trainers never share a Stripe customer.
        if (await syncMemberSubscriptionFromStripe(sub.customer as string, sub)) break;
```

- `customer.subscription.deleted`: at the top of the case, after `const sub = ...`, add
  `if (await markMemberCanceled(sub.customer as string)) break;`
- `invoice.payment_failed`: at the top of the case, after `const invoice = ...`, add
  `if (await markMemberPastDue(invoice.customer as string)) break;`

- [ ] **Step 4: Write the webhook test**

`app/api/stripe/__tests__/webhook.member.test.ts`: copy the mocking skeleton from `app/api/stripe/__tests__/webhook.notify.test.ts` (it mocks `@/lib/stripe` `webhooks.constructEvent`, `@/lib/prisma`, the notify service and `next/server` `after`). Add a mock for `@/lib/services/member-billing.service` that keeps `MEMBER_PURCHASE_TYPE: "member_subscription"` and uses `vi.fn()` for the four functions. Tests:
1. `checkout.session.completed` with `metadata.purchaseType = "member_subscription"` → `activateMemberFromCheckout` is called and `activateSubscriptionFromCheckout` is not.
2. `customer.subscription.updated` where `syncMemberSubscriptionFromStripe` resolves `1` → the trainer `syncSubscriptionFromStripe` is not called. When it resolves `0` → the trainer sync is called (trainer regression).
3. `customer.subscription.deleted` where `markMemberCanceled` resolves `1` → `prisma.trainerSubscription.findUnique` is not called and the response is 200.
4. `invoice.payment_failed` where `markMemberPastDue` resolves `0` → the existing trainer path runs (`trainerSubscription.findUnique` is called).
5. The same member `checkout.session.completed` event delivered twice → 200 both times (idempotent `updateMany`).

Run: `npx vitest run app/api/stripe`
Expected: PASS (including the existing `webhook.notify.test.ts`).

- [ ] **Step 5: Member checkout and portal routes**

`app/api/checkout/member/route.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getOrgCapabilities } from "@/lib/org-capabilities";
import { MEMBER_PURCHASE_TYPE } from "@/lib/services/member-billing.service";
import { appBaseUrl } from "@/lib/utils/app-url";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "CLIENT" || !user.clerkOrgId) return new NextResponse("Forbidden", { status: 403 });

  const org = await prisma.organization.findUnique({ where: { clerkOrgId: user.clerkOrgId } });
  if (!org || getOrgCapabilities(org).billing !== "member") return new NextResponse("Forbidden", { status: 403 });
  if (!org.stripePriceId) return new NextResponse("Club has no price configured", { status: 409 });

  const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
  if (!sub) return new NextResponse("Subscription record not found", { status: 404 });
  if (sub.status === "ACTIVE") return new NextResponse("Already subscribed", { status: 409 });

  // Reuse the customer on resubscribe so billing history stays in one place.
  let customerId = sub.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim() || undefined,
      metadata: { userId: user.id, clerkOrgId: org.clerkOrgId },
    });
    customerId = customer.id;
    await prisma.memberSubscription.update({ where: { userId: user.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: org.stripePriceId, quantity: 1 }],
    metadata: { purchaseType: MEMBER_PURCHASE_TYPE, userId: user.id },
    subscription_data: { metadata: { purchaseType: MEMBER_PURCHASE_TYPE, userId: user.id } },
    success_url: `${appBaseUrl()}/billing/success`,
    cancel_url: `${appBaseUrl()}/billing?reason=canceled_checkout`,
  });

  if (!session.url) return new NextResponse("Checkout session URL unavailable", { status: 500 });
  return NextResponse.json({ url: session.url });
}
```

`app/api/stripe/member-portal/route.ts` follows the pattern of `app/api/stripe/portal/route.ts`, but: the user must be a CLIENT, it reads `prisma.memberSubscription.findUnique({ where: { userId: user.id } })`, returns 404 when `!sub?.stripeCustomerId`, and uses `return_url: \`${appBaseUrl()}/billing\``.

Check that `/billing/success` works for a CLIENT. Read `app/billing/success/page.tsx` and `app/billing/layout.tsx`, and if either redirects non-trainers, let CLIENTs through to a "You're subscribed — go to dashboard" state.

- [ ] **Step 6: Member billing view**

In `app/billing/page.tsx` replace

```ts
  if (!user || user.role !== "TRAINER") redirect("/dashboard");
```

with

```ts
  if (!user) redirect("/dashboard");
  if (user.role === "CLIENT") {
    const org = await getOrgForUser(user);
    if (getOrgCapabilities(org).billing !== "member" || !org) redirect("/dashboard");
    const sub = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    const { reason } = await searchParams;
    return <MemberBillingView org={org} sub={sub} reason={reason ?? null} />;
  }
```

(Imports: `getOrgForUser` from `@/lib/org-capabilities.server`, `getOrgCapabilities` from `@/lib/org-capabilities`, `MemberBillingView` from `./member-billing-view`. Remove the now-duplicate `const { reason } = await searchParams;` only if the compiler flags the shadowing; the trainer branch keeps its own.)

`app/billing/member-billing-view.tsx` is a server component:

```tsx
import type { MemberSubscription, Organization } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trialDaysLeft } from "@/lib/billing/access";
import { formatStripeAmount } from "@/lib/utils/money";
import { MemberBillingButtons } from "./member-billing-buttons";

export async function MemberBillingView({
  org, sub, reason,
}: { org: Organization; sub: MemberSubscription | null; reason: string | null }) {
  const branding = await getOrgBranding(org.clerkOrgId);
  const price = org.stripePriceId ? await stripe.prices.retrieve(org.stripePriceId).catch(() => null) : null;
  const priceLabel = price?.unit_amount != null
    ? `${formatStripeAmount(price.unit_amount, price.currency)} / ${price.recurring?.interval ?? "month"}`
    : null;
  const daysLeft = trialDaysLeft(sub, new Date());
  const isActive = sub?.status === "ACTIVE" || sub?.status === "PAST_DUE";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[oklch(0.97_0.005_247)] px-4 py-12">
      <BrandStyle branding={branding} />
      <OrgIdentity branding={toViewModel(branding)} surface="light" />
      {reason === "trial_expired" && (
        <p className="rounded-lg border border-neutral-border bg-neutral-soft px-4 py-3 text-sm text-neutral-foreground">
          Your free trial has ended. Subscribe to keep training.
        </p>
      )}
      {reason === "payment_failed" && (
        <p className="rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger-foreground">
          Your last payment failed — update your card to restore access.
        </p>
      )}
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{branding.displayName} membership</CardTitle>
          <CardDescription>
            {daysLeft !== null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial.` : null}
            {isActive ? "Your membership is active." : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {priceLabel && <p className="text-2xl font-semibold text-foreground">{priceLabel}</p>}
          <MemberBillingButtons
            canSubscribe={!isActive && Boolean(org.stripePriceId)}
            canManage={Boolean(sub?.stripeCustomerId)}
            missingPrice={!org.stripePriceId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `app/billing/member-billing-buttons.tsx` (client). It has a "Subscribe" button that POSTs `/api/checkout/member` and redirects to `url`, a "Manage billing" button that POSTs `/api/stripe/member-portal`, and, when `missingPrice`, the text "Subscriptions aren't set up for this club yet — contact support." Base it on `components/billing/pricing-cards.tsx`'s fetch → `window.location.href = url` pattern and its toast-on-error handling.

Check that `formatStripeAmount` in `lib/utils/money.ts` takes `(amountInMinorUnits, currency)`, and adjust if not.

- [ ] **Step 7: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run lint:palette`
Expected: no new failures.

- [ ] **Step 8: Checkpoint.** Leave uncommitted.

---

### Task 9: Crons (starter programs and trial reminders)

**Files:**
- Create: `lib/clubs/trial-reminders.ts`
- Create: `lib/email/templates/member-trial-reminder.tsx`
- Create: `app/api/cron/club-starter-programs/route.ts`
- Create: `app/api/cron/member-trial-reminders/route.ts`
- Create: `lib/services/member-trial-reminder.service.ts`
- Modify: `vercel.json` (2 crons)
- Test: `lib/clubs/__tests__/trial-reminders.test.ts`
- Test: `lib/services/__tests__/member-trial-reminder.service.test.ts`

**Interfaces:**
- Consumes: `sweepClubStarterPrograms` (Task 6), `getEmailBranding(clerkOrgId)` (`lib/email/branding.ts`), `sendEmail` (`lib/email/send.ts`), `appBaseUrl`.
- Produces:
  - `type ReminderKey = "d3" | "d1" | "d0"`
  - `dueReminder(trialEndsAt: Date, sent: string[], now: Date): ReminderKey | null`
  - `sendDueTrialReminders(now?: Date): Promise<{ checked: number; sent: number }>`

- [ ] **Step 1: Write the failing pure test**

`lib/clubs/__tests__/trial-reminders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dueReminder } from "@/lib/clubs/trial-reminders";

const now = new Date("2026-10-10T15:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);

describe("dueReminder", () => {
  it("nothing when more than 3 days remain", () => {
    expect(dueReminder(inHours(24 * 3 + 1), [], now)).toBeNull();
  });
  it("d3 within 3 days", () => {
    expect(dueReminder(inHours(60), [], now)).toBe("d3");
  });
  it("d1 within 1 day, even if d3 was never sent", () => {
    expect(dueReminder(inHours(20), [], now)).toBe("d1");
    expect(dueReminder(inHours(20), ["d3"], now)).toBe("d1");
  });
  it("d0 once the trial has ended", () => {
    expect(dueReminder(inHours(-1), ["d3", "d1"], now)).toBe("d0");
  });
  it("never repeats a sent key", () => {
    expect(dueReminder(inHours(60), ["d3"], now)).toBeNull();
    expect(dueReminder(inHours(-1), ["d0"], now)).toBeNull();
  });
  it("stops after the trial is long over (no late spam)", () => {
    expect(dueReminder(inHours(-24 * 8), [], now)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `lib/clubs/trial-reminders.ts` and run the test**

```ts
/**
 * Which trial reminder a member is due, if any. Only the most urgent unsent
 * one is returned, so a member who joined with <1 day left gets "d1", not "d3"
 * then "d1". Nothing is sent more than 7 days after the trial ended.
 */
export type ReminderKey = "d3" | "d1" | "d0";

const HOUR_MS = 3600_000;

export function dueReminder(trialEndsAt: Date, sent: string[], now: Date): ReminderKey | null {
  const hoursLeft = (trialEndsAt.getTime() - now.getTime()) / HOUR_MS;
  let key: ReminderKey | null = null;
  if (hoursLeft <= 0 && hoursLeft > -24 * 7) key = "d0";
  else if (hoursLeft > 0 && hoursLeft <= 24) key = "d1";
  else if (hoursLeft > 24 && hoursLeft <= 72) key = "d3";
  return key && !sent.includes(key) ? key : null;
}
```

Run: `npx vitest run lib/clubs/__tests__/trial-reminders.test.ts`
Expected: PASS.

- [ ] **Step 3: Email template**

`lib/email/templates/member-trial-reminder.tsx`:

```tsx
import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";
import type { ReminderKey } from "@/lib/clubs/trial-reminders";

interface Props extends Partial<EmailBrandProps> {
  recipientName: string;
  clubName: string;
  reminder: ReminderKey;
  billingLink: string;
}

const COPY: Record<ReminderKey, { title: string; intro: (club: string) => string }> = {
  d3: { title: "3 days left in your free trial", intro: (c) => `Your free ${c} trial ends in 3 days. Subscribe now to keep your programs and progress.` },
  d1: { title: "Your free trial ends tomorrow", intro: (c) => `Your free ${c} trial ends tomorrow. Subscribe to keep training without interruption.` },
  d0: { title: "Your free trial has ended", intro: (c) => `Your free ${c} trial has ended. Subscribe any time to pick up right where you left off.` },
};

export function MemberTrialReminderEmail({ recipientName, clubName, reminder, billingLink, ...brand }: Props) {
  const copy = COPY[reminder];
  return (
    <EmailLayout
      {...brand}
      title={copy.title}
      greeting={`Hi ${recipientName},`}
      intro={copy.intro(clubName)}
      cta={{ label: "Subscribe", href: billingLink }}
      reason="You're receiving this because you started a free trial."
    />
  );
}
```

Add a render test in `lib/email/templates/__tests__/`, copying an existing template test there. Assert that `d0` renders "has ended" and that the CTA href is present.

- [ ] **Step 4: Write the failing service test**

`lib/services/__tests__/member-trial-reminder.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { memberSubscription: { findMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("@/lib/email/branding", () => ({
  getEmailBranding: vi.fn(async () => ({ organizationName: "Pine Valley", fromName: "Pine Valley", enabled: true })),
}));

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { sendDueTrialReminders } from "../member-trial-reminder.service";

const now = new Date("2026-10-10T15:00:00Z");
const row = (overrides = {}) => ({
  id: "ms1", userId: "u1", clerkOrgId: "org_club", status: "TRIALING",
  trialEndsAt: new Date(now.getTime() + 20 * 3600_000), remindersSent: [],
  user: { email: "sam@example.com", firstName: "Sam", isActive: true },
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("sendDueTrialReminders", () => {
  it("sends the due reminder and records it", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([row()] as any);
    expect(await sendDueTrialReminders(now)).toEqual({ checked: 1, sent: 1 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sam@example.com", subject: "Your free trial ends tomorrow" }));
    expect(prisma.memberSubscription.update).toHaveBeenCalledWith({
      where: { id: "ms1" }, data: { remindersSent: { push: "d1" } },
    });
  });
  it("does not record a reminder when the email failed (retried next run)", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([row()] as any);
    vi.mocked(sendEmail).mockResolvedValueOnce(false);
    expect((await sendDueTrialReminders(now)).sent).toBe(0);
    expect(prisma.memberSubscription.update).not.toHaveBeenCalled();
  });
  it("skips reminders already sent and deactivated users", async () => {
    vi.mocked(prisma.memberSubscription.findMany).mockResolvedValue([
      row({ remindersSent: ["d1"] }),
      row({ id: "ms2", user: { email: "x@y.z", firstName: "X", isActive: false } }),
    ] as any);
    expect((await sendDueTrialReminders(now)).sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Implement `lib/services/member-trial-reminder.service.ts`**

```ts
import * as React from "react";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { getEmailBranding } from "@/lib/email/branding";
import { appBaseUrl } from "@/lib/utils/app-url";
import { dueReminder } from "@/lib/clubs/trial-reminders";
import { MemberTrialReminderEmail } from "@/lib/email/templates/member-trial-reminder";

const SUBJECTS = {
  d3: "3 days left in your free trial",
  d1: "Your free trial ends tomorrow",
  d0: "Your free trial has ended",
} as const;

/**
 * Daily cron body. Candidates are still-TRIALING members whose trial ends
 * within 3 days or ended within the last 7. A key is only recorded after a
 * successful send, so a Resend hiccup is retried on the next run instead of
 * silently dropped.
 */
export async function sendDueTrialReminders(now = new Date()) {
  const subs = await prisma.memberSubscription.findMany({
    where: {
      status: "TRIALING",
      trialEndsAt: {
        lte: new Date(now.getTime() + 72 * 3600_000),
        gte: new Date(now.getTime() - 7 * 24 * 3600_000),
      },
    },
    include: { user: { select: { email: true, firstName: true, isActive: true } } },
  });

  let sent = 0;
  for (const sub of subs) {
    if (!sub.user.isActive) continue;
    const key = dueReminder(sub.trialEndsAt, sub.remindersSent, now);
    if (!key) continue;
    const brand = await getEmailBranding(sub.clerkOrgId);
    const ok = await sendEmail({
      to: sub.user.email,
      subject: SUBJECTS[key],
      fromName: brand.fromName,
      replyTo: brand.replyTo,
      react: React.createElement(MemberTrialReminderEmail, {
        recipientName: sub.user.firstName || "there",
        clubName: brand.organizationName,
        reminder: key,
        billingLink: `${appBaseUrl()}/billing`,
        organizationName: brand.organizationName,
        accent: brand.accent,
        logoUrl: brand.logoUrl,
      }),
    });
    if (!ok) continue;
    await prisma.memberSubscription.update({ where: { id: sub.id }, data: { remindersSent: { push: key } } });
    sent += 1;
  }
  return { checked: subs.length, sent };
}
```

Run: `npx vitest run lib/services/__tests__/member-trial-reminder.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Cron routes and schedule**

Both routes copy `app/api/cron/retry-program-purchases/route.ts` exactly (same `CRON_SECRET` check, same try/catch → 500 JSON). The only differences are the doc comment and the body call:
- `app/api/cron/club-starter-programs/route.ts` → `const result = await sweepClubStarterPrograms();` (import from `@/lib/services/club-member.service`). Add `export const maxDuration = 300;` because clones are slow.
- `app/api/cron/member-trial-reminders/route.ts` → `const result = await sendDueTrialReminders();` (import from `@/lib/services/member-trial-reminder.service`).

In `vercel.json` add to `crons`:

```json
    {
      "path": "/api/cron/club-starter-programs",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/member-trial-reminders",
      "schedule": "0 15 * * *"
    }
```

`/api/cron(.*)` is already public in `lib/auth/public-routes.ts`, so nothing to add there.

- [ ] **Step 7: Verify**

Run: `npx vitest run lib/clubs lib/services lib/email && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Checkpoint.** Leave uncommitted.

---

### Task 10: Super-admin club management

**Files:**
- Modify: `lib/audit/catalog.ts` (new actions)
- Create: `actions/admin-club-actions.ts`
- Modify: `components/admin/admin-sidebar.tsx:21-27` (nav entry). If `components/admin/admin-mobile-nav.tsx` has its own list, add it there too.
- Create: `app/admin/clubs/page.tsx` (list)
- Create: `app/admin/clubs/new/page.tsx`, `app/admin/clubs/club-form.tsx` (shared create/edit form)
- Create: `app/admin/clubs/[orgId]/page.tsx` (detail + members + extend trial)
- Create: `app/admin/clubs/[orgId]/extend-trial-button.tsx`
- Test: `actions/__tests__/admin-club-actions.test.ts`

**Interfaces:**
- Consumes: `parseClubInput`, `createClub`, `updateClub`, `setOrgType`, `listClubsWithStats`, `ClubError` (Task 5); `requireSuperAdmin` (`lib/current-user.ts`); `logUserAudit`, `diffFields` (`lib/services/audit-log.service.ts`); `AUDIT_ACTIONS` (`lib/audit/catalog.ts`).
- Produces (all `"use server"`, all call `requireSuperAdmin()` first, all return `{ ok: true, ... } | { ok: false; error: string }`):
  - `createClubAction(raw: Record<string, unknown>): Promise<{ ok: true; clerkOrgId: string } | { ok: false; error: string }>`
  - `updateClubAction(clerkOrgId: string, raw: Record<string, unknown>)`
  - `extendMemberTrialAction(userId: string, days: number)`: sets `trialEndsAt = max(now, trialEndsAt) + days` and `status: "TRIALING"`. Only allowed when status is TRIALING, or CANCELED with no `stripeSubscriptionId` (never over a paid/Stripe-managed sub). `days` must be an integer from 1 to 90.
  - `setOrgTypeAction(clerkOrgId: string, type: "TRAINER" | "CLUB")`

- [ ] **Step 1: Add audit actions**

In `lib/audit/catalog.ts`, add to `AUDIT_ACTION_CATALOG` next to the ORGANIZATION entries:

```ts
  CLUB_CREATED: { label: "Created club", category: "ORGANIZATION", tone: "success" },
  CLUB_UPDATED: { label: "Updated club", category: "ORGANIZATION", tone: "info" },
  ORG_TYPE_CHANGED: { label: "Changed org type", category: "ORGANIZATION", tone: "warning" },
  MEMBER_TRIAL_EXTENDED: { label: "Extended member trial", category: "USERS", tone: "info" },
```

Run `npx vitest run lib/audit` and update any catalog snapshot or exhaustive-list test it breaks.

- [ ] **Step 2: Write the failing action test**

`actions/__tests__/admin-club-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ requireSuperAdmin: vi.fn(async () => ({ id: "admin1", role: "TRAINER", email: "a@x.com", firstName: "A", lastName: "D", clerkOrgId: null })) }));
vi.mock("@/lib/services/audit-log.service", () => ({ logUserAudit: vi.fn(), diffFields: vi.fn(() => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberSubscription: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/services/club.service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/club.service")>("@/lib/services/club.service");
  return { ...actual, createClub: vi.fn(), updateClub: vi.fn(), setOrgType: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { logUserAudit } from "@/lib/services/audit-log.service";
import { createClub, setOrgType, ClubError } from "@/lib/services/club.service";
import { createClubAction, extendMemberTrialAction, setOrgTypeAction } from "../admin-club-actions";

beforeEach(() => vi.clearAllMocks());

const form = { name: "Pine", joinSlug: "pine", joinCode: "PINE24", trialDays: "14", stripePriceId: "price_1", starterProgramIds: ["p1"] };

describe("admin club actions", () => {
  it("requires super admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createClubAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(createClub).not.toHaveBeenCalled();
  });

  it("creates a club and audits it", async () => {
    vi.mocked(createClub).mockResolvedValue({ clerkOrgId: "org_new", name: "Pine" } as any);
    expect(await createClubAction(form)).toEqual({ ok: true, clerkOrgId: "org_new" });
    expect(logUserAudit).toHaveBeenCalled();
  });

  it("turns ClubError into a user-facing error", async () => {
    vi.mocked(createClub).mockRejectedValue(new ClubError("slug_taken", "That join link is already used by another club."));
    expect(await createClubAction(form)).toEqual({ ok: false, error: "That join link is already used by another club." });
  });

  it("extends a trial from the later of now and the current end", async () => {
    const end = new Date(Date.now() + 2 * 86400_000);
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ userId: "u1", status: "TRIALING", trialEndsAt: end, stripeSubscriptionId: null } as any);
    expect((await extendMemberTrialAction("u1", 7)).ok).toBe(true);
    const data = vi.mocked(prisma.memberSubscription.update).mock.calls[0][0].data as any;
    expect(data.status).toBe("TRIALING");
    expect(data.trialEndsAt.getTime()).toBe(end.getTime() + 7 * 86400_000);
  });

  it("refuses to extend a paying member or a bad day count", async () => {
    vi.mocked(prisma.memberSubscription.findUnique).mockResolvedValue({ userId: "u1", status: "ACTIVE", trialEndsAt: new Date(), stripeSubscriptionId: "sub_1" } as any);
    expect((await extendMemberTrialAction("u1", 7)).ok).toBe(false);
    expect((await extendMemberTrialAction("u1", 0)).ok).toBe(false);
    expect((await extendMemberTrialAction("u1", 91)).ok).toBe(false);
    expect(prisma.memberSubscription.update).not.toHaveBeenCalled();
  });

  it("surfaces the has_clients guard on type change", async () => {
    vi.mocked(setOrgType).mockRejectedValue(new ClubError("has_clients", "Org type can't change once it has clients."));
    expect(await setOrgTypeAction("org_1", "TRAINER")).toEqual({ ok: false, error: "Org type can't change once it has clients." });
  });
});
```

- [ ] **Step 3: Run it to verify it fails, then implement `actions/admin-club-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { OrgType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/current-user";
import { logUserAudit, diffFields } from "@/lib/services/audit-log.service";
import { AUDIT_ACTIONS } from "@/lib/audit/catalog";
import { ClubError, createClub, parseClubInput, setOrgType, updateClub } from "@/lib/services/club.service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const DAY_MS = 86400_000;

function toError(err: unknown): { ok: false; error: string } {
  if (err instanceof ClubError) return { ok: false, error: err.message };
  console.error("admin club action failed:", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createClubAction(raw: Record<string, unknown>): Promise<Result<{ clerkOrgId: string }>> {
  const admin = await requireSuperAdmin();
  try {
    const org = await createClub(parseClubInput(raw));
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_CREATED,
      targetType: "Organization",
      targetId: org.clerkOrgId,
      orgId: org.clerkOrgId,
      metadata: { name: org.name, joinSlug: org.joinSlug },
    }));
    revalidatePath("/admin/clubs");
    return { ok: true, clerkOrgId: org.clerkOrgId };
  } catch (err) {
    return toError(err);
  }
}

export async function updateClubAction(clerkOrgId: string, raw: Record<string, unknown>): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    const before = await prisma.organization.findUnique({ where: { clerkOrgId } });
    const input = parseClubInput(raw);
    await updateClub(clerkOrgId, input);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.CLUB_UPDATED,
      targetType: "Organization",
      targetId: clerkOrgId,
      orgId: clerkOrgId,
      changes: before
        ? diffFields(before as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>,
            ["name", "joinSlug", "joinCode", "trialDays", "stripePriceId", "starterProgramIds"])
        : undefined,
    }));
    revalidatePath(`/admin/clubs/${clerkOrgId}`);
    revalidatePath("/admin/clubs");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function extendMemberTrialAction(userId: string, days: number): Promise<Result> {
  const admin = await requireSuperAdmin();
  if (!Number.isInteger(days) || days < 1 || days > 90) return { ok: false, error: "Extend by 1–90 days." };
  const sub = await prisma.memberSubscription.findUnique({ where: { userId } });
  if (!sub) return { ok: false, error: "Member not found." };
  const extendable = sub.status === "TRIALING" || (sub.status === "CANCELED" && !sub.stripeSubscriptionId);
  if (!extendable) return { ok: false, error: "Only trial members can be extended; paid billing is managed in Stripe." };

  const base = Math.max(Date.now(), sub.trialEndsAt.getTime());
  const trialEndsAt = new Date(base + days * DAY_MS);
  await prisma.memberSubscription.update({
    where: { userId },
    data: { trialEndsAt, status: "TRIALING", remindersSent: [] },
  });
  await logUserAudit(admin, () => ({
    action: AUDIT_ACTIONS.MEMBER_TRIAL_EXTENDED,
    targetType: "User",
    targetId: userId,
    orgId: sub.clerkOrgId,
    metadata: { days, trialEndsAt: trialEndsAt.toISOString() },
  }));
  revalidatePath(`/admin/clubs/${sub.clerkOrgId}`);
  return { ok: true };
}

export async function setOrgTypeAction(clerkOrgId: string, type: OrgType): Promise<Result> {
  const admin = await requireSuperAdmin();
  try {
    await setOrgType(clerkOrgId, type);
    await logUserAudit(admin, () => ({
      action: AUDIT_ACTIONS.ORG_TYPE_CHANGED,
      targetType: "Organization",
      targetId: clerkOrgId,
      orgId: clerkOrgId,
      metadata: { type },
    }));
    revalidatePath("/admin/clubs");
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}
```

Check the `logAudit` param names (`targetType`, `targetId`, `metadata`, `changes`) against `LogAuditParams` in `lib/services/audit-log.service.ts`, and rename to match if they differ. The test update in `extendMemberTrialAction` asserts only `status` and `trialEndsAt`, so resetting `remindersSent` is fine: an extended member should get fresh reminders.

Run: `npx vitest run actions/__tests__/admin-club-actions.test.ts`
Expected: PASS.

- [ ] **Step 4: Admin nav**

In `components/admin/admin-sidebar.tsx`, add after the Global Programs entry:

```ts
  { href: "/admin/clubs",            label: "Clubs",           icon: Flag },
```

and add `Flag` to the `lucide-react` import. Mirror the change in `admin-mobile-nav.tsx` if it keeps its own list.

- [ ] **Step 5: List page `app/admin/clubs/page.tsx`**

This is a server component. `requireSuperAdmin()` already runs in the admin layout. Call `listClubsWithStats()` and render, following the table pattern in `app/admin/users/page.tsx` (read it and reuse its table components and header style):
- A header "Clubs" with a `Button` link "New club" → `/admin/clubs/new`
- Columns: Club (link to `/admin/clubs/{org.clerkOrgId}`), Join link (`/join/{joinSlug}`), Members, Trialing, Paying, Conversion (`conversionRate === null ? "—" : Math.round(rate * 100) + "%"`)
- An empty state: "No clubs yet. Create one to get a join link."

- [ ] **Step 6: Shared form `app/admin/clubs/club-form.tsx`**

This is a client component. Props: `{ mode: "create" } | { mode: "edit"; clerkOrgId: string; initial: ClubFormValues }`, plus `globalPrograms: { id: string; name: string }[]`.
- Fields: name, join slug (with the helper line "Link: /join/{slug}"), access code, trial days (number, default 14), Stripe price id.
- Starter programs: an ordered list chosen from `globalPrograms`. Use a `select` to add a program, and up/down/remove buttons per row. Keep it simple and don't pull in dnd-kit.
- On submit it calls `createClubAction(values)` or `updateClubAction(clerkOrgId, values)`, shows `toast.error(res.error)` on failure, and on success runs `router.push(\`/admin/clubs/${id}\`)` + `toast.success`.

`app/admin/clubs/new/page.tsx` is a server component. It loads global programs with `prisma.program.findMany({ where: { isGlobal: true }, select: { id: true, name: true, schedulingType: true }, orderBy: { name: "asc" } })`, keeps only `getProgramSchedulingType(p) === "SCHEDULED"`, and renders `<ClubForm mode="create" globalPrograms={...} />`. A note under the form says: "Branding (logo, color) is set after creation on the club page." The page is under `/admin`; branding upload reuses the existing org branding editor, see Step 7.

- [ ] **Step 7: Detail page `app/admin/clubs/[orgId]/page.tsx`**

This is a server component.
- Load the org (`notFound()` unless CLUB).
- Render `<ClubForm mode="edit" ... />` prefilled.
- Branding: check whether the existing branding editor (`app/(platform)/settings/branding`) has an admin-usable form component that takes a `clerkOrgId`. If it does, render it here. If it's bound to the current user's org, show "Branding editor for clubs: follow-up" as a muted note and list it in the hand-off. Don't rewrite the branding editor in this task.
- Members table: `prisma.memberSubscription.findMany({ where: { clerkOrgId }, include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 })`. Columns: name, email, `StatusBadge` for status (reuse `lib/ui/status.ts` roles, `TRIALING` is already mapped), trial ends (date), starter status, and an actions cell with `<ExtendTrialButton userId=... disabled={!(status === "TRIALING" || (status === "CANCELED" && !stripeSubscriptionId))} />`.
- Org type: show "Type: Club". Beside it, a "Convert to trainer org" button calling `setOrgTypeAction(clerkOrgId, "TRAINER")` that is disabled with a tooltip "Has members" when the members count is > 0.

`extend-trial-button.tsx` is a client component: a small dialog or popover with a number input (default 7) and a confirm button that calls `extendMemberTrialAction` and toasts the result. Follow an existing confirm-dialog pattern from `components/ui`. Don't use `window.confirm`.

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run lint:palette`
Expected: no new failures, palette 0.

- [ ] **Step 9: Checkpoint.** Leave uncommitted.

---

### Task 11: Whole-feature verification and hand-off

**Files:**
- Create: `docs/superpowers/plans/2026-09-29-club-member-billing-handoff.md`
- Modify: `.env.example` if it exists (add `CLUB_JOIN_SECRET=`, `PLATFORM_STAFF_EMAIL=`)

- [ ] **Step 1: Full checks**

Run:
```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run lint:palette
DATABASE_URL="mongodb://127.0.0.1:1/none" npx next build
```
Expected: vitest shows only the 5 known baseline failures, tsc clean, lint clean, palette 0, build succeeds. The build points `DATABASE_URL` at a dead port so it can't reach prod.

- [ ] **Step 2: Trainer regression read-through**

Diff `app/(platform)/layout.tsx`, `app/api/stripe/webhook/route.ts`, `app/api/webhooks/clerk/route.ts` and `actions/onboarding-actions.ts`, and confirm for a TRAINER org:
1. The trainer gate outcome is identical (same redirects).
2. The trainer Stripe events reach the same code.
3. Invited-client onboarding still sets `clerkOrgId` when the session has an org.
4. The nav is unchanged (`hiddenHrefs` is empty).

- [ ] **Step 3: Write the hand-off doc**

`docs/superpowers/plans/2026-09-29-club-member-billing-handoff.md` must contain:
- **Rollout order:**
  1. `prisma db push`, run by the owner, before deploy.
  2. Set `CLUB_JOIN_SECRET` and `PLATFORM_STAFF_EMAIL` in Vercel (Production + Preview).
  3. Make sure the staff TRAINER user exists (sign up normally, finish trainer onboarding; its own trainer org is fine).
  4. Confirm the Clerk plan allows `maxAllowedMemberships: 0` (unlimited) or a big enough cap.
  5. Create a Stripe product + recurring price per club.
  6. Author the starter programs in `/admin/global-programs`.
  7. Deploy.
  8. Create the club in `/admin/clubs/new`.
- **Manual E2E in Stripe test mode:** create a club → open `/join/<slug>` in a private window → wrong code ×2 gives the generic error → right code → sign up → lands in onboarding → dashboard shows the trial banner, and the Inbox is gone from the nav and the tab bar → `/messages` redirects to the dashboard → the starter program appears within ~1 min → set `trialEndsAt` to yesterday in the test DB → any page redirects to `/billing?reason=trial_expired` → Subscribe with test card `4242…` → back in the app, no banner → cancel in "Manage billing" → at period end (or via Stripe test clock) access is blocked → Subscribe again reuses the same customer.
- **Trainer regression spot check:** an existing trainer account and an invited client behave as before.
- **Known follow-ups:** the club branding editor from admin (if not wired in Task 10 Step 7); club-facing reporting; card-up-front option; email allowlist.

- [ ] **Step 4: Checkpoint.** Leave everything uncommitted and report to the owner with the hand-off path.
