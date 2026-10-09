# Admin-Managed Clubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-club invited trainer with a built-in house coach per club that super admins operate through a "Manage club" sign-in-token flow, with audit attribution and admin alerts.

**Architecture:** Each club org gets a passwordless Clerk user + DB `User` (role TRAINER) linked by `Organization.houseCoachUserId`; every existing trainer-side feature works unchanged against it. Admins enter via a server-created Clerk sign-in token plus a signed HMAC marker cookie; `proxy.ts` signs out any house-coach session without a valid marker. Audit + message attribution read the marker; `notifyUser` fans house-coach notifications out to admin subscribers.

**Tech Stack:** Next.js App Router (`proxy.ts`), Clerk `@clerk/nextjs` 7.0.4 (signal `useSignIn`: `signIn.ticket()` + `signIn.finalize()`, see `app/p/[slug]/success/claim-account.tsx`), Prisma on MongoDB, vitest (`TZ=UTC npx vitest run`), Resend email via `notifyUser`.

**Spec:** `docs/superpowers/specs/2026-10-09-admin-managed-clubs-design.md` (decisions H1–H17 referenced below).

## Global Constraints

- **NEVER run `git add` / `git commit`.** The owner reviews and commits. Replace every commit step with "leave changes uncommitted".
- Run tests with `TZ=UTC npx vitest run <path>`; type-check with `npx tsc --noEmit`; lint palette rule must stay at 0 (use design tokens, never raw Tailwind palette colors).
- Mongo: no optional `@unique`; "is null" filters use `nullOrUnset(field)` from `lib/db/mongo-null.ts`; create rows with explicit `null`s for optional fields that are later filtered on.
- Only `lib/org-capabilities.ts` branches on org type for capabilities; do not add new org-type branches elsewhere.
- Trainer (non-club) orgs must behave exactly as before.
- Audit writes go through `logUserAudit` / `logAudit` and never throw.
- After schema edits: `npx prisma generate` (do NOT run `db push` against any database).
- Copy: member-facing house coach name = `Coach` + club name; banner text `Managing <club> as <admin first name> · Exit`.

## Review Focus

1. A house-coach session that outlives its marker (cookie expired/cleared, opened in another browser) must be signed out, not keep working — Task 4 tests `verifyClubAdminMarker` expiry/tamper/wrong-user and the proxy decision function.
2. A non-super-admin calling `enterClubAction` (or forging the ticket page) must get nothing — Task 4 tests rejection before any Clerk call.
3. Calling `ensureHouseCoach` twice concurrently / after a partial failure (Clerk user created, DB row not) must not create a second coach — Task 1 tests idempotency by looking up the Clerk user by `externalId` before creating.
4. A member messaging the coach while no admin is subscribed (or all muted) must not error — Task 7 tests fan-out with zero recipients.
5. Migration re-run after `--apply` must be a no-op — Task 8 tests second run reports zero changes.

---

### Task 1: Schema + house coach service

**Files:**
- Modify: `prisma/schema.prisma` (Organization, Message, new AdminClubSession, ClubAlertSubscriber — exact blocks in spec §3)
- Create: `lib/services/house-coach.service.ts`
- Test: `lib/services/__tests__/house-coach.service.test.ts`

**Interfaces:**
- Produces:
  - `houseCoachEmail(clerkOrgId: string): string` → `house-coach+<clerkOrgId lowercased>@<domain>`; domain parsed from `process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM` (export `DEFAULT_FROM` / a `fromAddress()` helper from `lib/email/send.ts` if not already exported; handle `"Name <a@b.com>"` form).
  - `ensureHouseCoach(org: Organization): Promise<User>`
  - `getHouseCoach(clerkOrgId: string): Promise<User | null>` (reads `houseCoachUserId`; returns null for non-clubs)
  - `requireHouseCoach(clerkOrgId: string): Promise<User>` (loads org, `ensureHouseCoach`, throws `ClubError("not_found")` for non-clubs)
  - `isHouseCoach(user: Pick<User,"id"|"clerkOrgId">, org?: Organization | null): Promise<boolean>` — true iff the user's org's `houseCoachUserId === user.id`
  - `syncHouseCoachProfile(org: Organization): Promise<void>` — sets Clerk + DB first/last name and imageUrl (club logo, if any) to H2 values
  - `HOUSE_COACH_FIRST_NAME = "Coach"`

`ensureHouseCoach` algorithm (idempotent, H4):
```ts
export async function ensureHouseCoach(org: Organization): Promise<User> {
  if (getOrgType(org) !== "CLUB") throw new ClubError("not_found", "Not a club.");
  if (org.houseCoachUserId) {
    const existing = await prisma.user.findUnique({ where: { id: org.houseCoachUserId } });
    if (existing) return existing;
  }
  const client = await clerkClient();
  const externalId = `house-coach:${org.clerkOrgId}`;
  // Reuse a Clerk user left by a crashed earlier attempt.
  const found = await client.users.getUserList({ externalId: [externalId], limit: 1 });
  const clerkUser = found.data[0] ?? await client.users.createUser({
    externalId,
    emailAddress: [houseCoachEmail(org.clerkOrgId)],
    firstName: HOUSE_COACH_FIRST_NAME,
    lastName: org.name,
    skipPasswordRequirement: true,
    publicMetadata: { houseCoach: true, clerkOrgId: org.clerkOrgId },
  });
  const user = await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {},
    create: {
      clerkId: clerkUser.id, email: houseCoachEmail(org.clerkOrgId),
      firstName: HOUSE_COACH_FIRST_NAME, lastName: org.name, imageUrl: clerkUser.imageUrl,
      role: "TRAINER", clerkOrgId: org.clerkOrgId, onboarded: true,
    },
  });
  try {
    await client.organizations.createOrganizationMembership({
      organizationId: org.clerkOrgId, userId: clerkUser.id, role: "org:admin",
    });
  } catch (err) {
    if (!isAlreadyMemberError(err)) throw err; // Clerk error code "already_a_member_in_organization"
  }
  await prisma.organization.update({ where: { id: org.id }, data: { houseCoachUserId: user.id } });
  return user;
}
```
Confirm `getUserList({ externalId })`, `createUser({ skipPasswordRequirement, externalId })` and `createOrganizationMembership` signatures in `node_modules/@clerk/backend/dist/api/endpoints/*.d.ts` before writing; adjust names to match.

- [ ] **Step 1:** Add the schema blocks from spec §3; run `npx prisma generate`; expect success.
- [ ] **Step 2: Failing tests** (mock `@clerk/nextjs/server` + `@/lib/prisma` like `lib/services/__tests__/club-trainer.service.test.ts`):
  - `houseCoachEmail("org_ABC")` with `RESEND_FROM_EMAIL="Athos <hello@useathos.ai>"` → `"house-coach+org_abc@useathos.ai"`.
  - `ensureHouseCoach` on a club with `houseCoachUserId` pointing to an existing user → returns it, no Clerk calls.
  - fresh club → `createUser` called once with `externalId: "house-coach:org_club"`, `publicMetadata.houseCoach === true`; `user.upsert` create has `role: "TRAINER"`, `onboarded: true`; membership created with `org:admin`; org updated with `houseCoachUserId`.
  - Clerk user already exists by externalId (crash recovery) → `createUser` NOT called, same upsert/membership/org update.
  - membership create throws `{ errors: [{ code: "already_a_member_in_organization" }] }` → still resolves.
  - non-club org → rejects with `ClubError` code `not_found`.
  - `getHouseCoach` on trainer org → null.
- [ ] **Step 3:** Run `TZ=UTC npx vitest run lib/services/__tests__/house-coach.service.test.ts` → FAIL (module missing).
- [ ] **Step 4:** Implement `lib/services/house-coach.service.ts` per the interface above.
- [ ] **Step 5:** Re-run → PASS. `npx tsc --noEmit` clean.
- [ ] **Step 6:** Leave changes uncommitted.

---

### Task 2: Clubs run on the house coach

**Files:**
- Modify: `lib/services/club.service.ts` (createClub, updateClub, ClubInput parse — drop `trainerEmail`)
- Modify: `lib/services/club-member.service.ts:125,205` (ownership → `requireHouseCoach`)
- Modify: `lib/services/coaching.service.ts:205` (`requestCoaching` notifies house coach; `not_offered` only when `coachingStripePriceId` is null)
- Modify: `actions/club-join-actions.ts:36`, `app/join/[slug]/page.tsx:22`, `app/join/[slug]/complete/page.tsx:47` (remove "not open" gate)
- Modify: `app/admin/clubs/[orgId]/starter-options.ts` (trainer templates → house coach templates)
- Modify: tests in `lib/services/__tests__/club.service.test.ts`, `club-member.service.test.ts`, `coaching.service.test.ts`, join action/page tests

**Interfaces:**
- Consumes: `ensureHouseCoach`, `getHouseCoach`, `requireHouseCoach` (Task 1).
- Produces: `ClubInput` no longer has `trainerEmail`; `createClub` returns the org with `houseCoachUserId` set. `ClubError` code `"house_coach_failed"`.

createClub change (replaces the invite block, H4/H5):
```ts
  try {
    await ensureHouseCoach(org);
  } catch (err) {
    console.error("House coach creation failed; rolling back club", clerkOrg.id, err);
    await prisma.organization.delete({ where: { clerkOrgId: clerkOrg.id } }).catch(() => {});
    await deleteClerkOrg(client, clerkOrg.id);
    await rollbackClubPrices(created);
    throw new ClubError("house_coach_failed", "Couldn't set up the club's coach account, so the club wasn't created.");
  }
  return prisma.organization.findUniqueOrThrow({ where: { clerkOrgId: clerkOrg.id } });
```
Note: deleting the Clerk org does not delete the house coach Clerk user; on rollback also call `client.users.deleteUser` if a house coach Clerk user was created (look it up by externalId, ignore errors).

- [ ] **Step 1: Failing tests:** createClub without `trainerEmail` calls `ensureHouseCoach` and no invitation API; ensureHouseCoach rejection → org deleted, Clerk org deleted, prices rolled back, `house_coach_failed`; member starter copy uses house coach id (no PENDING retry path for "no trainer"); `requestCoaching` notifies `houseCoachUserId`; join action/page no longer return `CLUB_NOT_OPEN_MESSAGE` for a club with no TRAINER.
- [ ] **Step 2:** Run the four test files → FAIL.
- [ ] **Step 3:** Implement; delete the "no trainer → skip/PENDING" branches since `requireHouseCoach` always yields one (keep catch-and-retry for genuine errors).
- [ ] **Step 4:** Re-run → PASS; `npx tsc --noEmit` (errors elsewhere from removed exports are fixed in Task 3; if tsc fails only on Task 3 files, note it and proceed).
- [ ] **Step 5:** Leave uncommitted.

---

### Task 3: Remove the club-trainer surface

**Files:**
- Modify: `app/admin/clubs/club-form.tsx`, `app/admin/clubs/new/page.tsx` (drop trainer email field)
- Delete: `app/admin/clubs/[orgId]/club-trainer-controls.tsx`; Modify: `app/admin/clubs/[orgId]/page.tsx` (replace trainer card with a "House coach" card: name, "Manage club" button placeholder slot filled in Task 5)
- Modify: `actions/admin-club-actions.ts` (delete `resendClubTrainerInviteAction`, `replaceClubTrainerAction`)
- Delete: `app/onboarding/club-trainer/`, `actions/club-trainer-onboarding-actions.ts`, `components/onboarding/club-trainer-onboarding-form.tsx` (+ its payload in `components/onboarding/onboarding-payloads.ts`)
- Modify: `app/api/webhooks/clerk/route.ts` (H17: skip users/memberships with `public_metadata.houseCoach === true`; remove `ensureClubTrainerUser` path)
- Modify: `app/onboarding/page.tsx`, `app/onboarding/client/page.tsx`, `actions/onboarding-actions.ts`, `app/(platform)/layout.tsx:56`, `lib/current-user.ts` (remove club-trainer redirects/checks)
- Modify: `lib/services/club-trainer.service.ts` → rename to `lib/services/club-ownership.service.ts`, keeping only `transferClubOwnership` and a `removeOrgTrainer(clerkOrgId, trainer: User)` (former `removeClubTrainer` taking the user explicitly). Update `lib/audit/catalog.ts`, `lib/email/templates/coaching-requested.tsx` copy if it says "club trainer".
- Tests: delete tests for removed functions; move `transferClubOwnership` tests to `club-ownership.service.test.ts`; webhook test: house-coach membership event is ignored.

- [ ] **Step 1:** `grep -rn "getClubTrainer\|inviteClubTrainer\|club-trainer\|ClubTrainer\|CLUB_NOT_OPEN" app actions lib components` — every hit must be gone or intentionally kept after this task.
- [ ] **Step 2: Failing test:** webhook `organizationMembership.created` with `public_user_data` for a user whose Clerk `publicMetadata.houseCoach` is true → no `user.create`/`update`.
- [ ] **Step 3:** Make the deletions/edits.
- [ ] **Step 4:** `TZ=UTC npx vitest run` (full) → PASS; `npx tsc --noEmit` clean; `npm run lint` clean.
- [ ] **Step 5:** Leave uncommitted.

---

### Task 4: Enter/exit club sessions + guard

**Files:**
- Create: `lib/clubs/admin-session-token.ts` (pure, Web Crypto `crypto.subtle`, no Node imports — must run in `proxy.ts`)
- Create: `lib/clubs/admin-session.ts` (server: cookies, prisma)
- Create: `actions/admin-club-session-actions.ts`
- Create: `app/club-session/enter/page.tsx` + `enter-client.tsx`; `app/club-session/ended/page.tsx` + client
- Modify: `lib/auth/public-routes.ts` (add `"/club-session/(.*)"` with a comment: the ticket/marker are the credentials)
- Modify: `proxy.ts`
- Modify: `lib/audit/catalog.ts` (add `CLUB_SESSION_STARTED`, `CLUB_SESSION_ENDED`, category ADMIN or nearest existing)
- Tests: `lib/clubs/__tests__/admin-session-token.test.ts`, `actions/__tests__/admin-club-session-actions.test.ts`, `lib/auth/__tests__/club-session-guard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // admin-session-token.ts
  export const CLUB_ADMIN_COOKIE = "club_admin_session";
  export const CLUB_ADMIN_SESSION_HOURS = 8;
  export interface ClubAdminMarker { sid: string; adminUserId: string; adminName: string; clerkOrgId: string; houseCoachClerkId: string; exp: number /* epoch ms */ }
  export async function signClubAdminMarker(m: ClubAdminMarker, secret?: string): Promise<string>;
  export async function verifyClubAdminMarker(token: string | undefined, secret?: string, now?: number): Promise<ClubAdminMarker | null>;
  /** proxy decision: true → redirect to /club-session/ended */
  export async function houseCoachSessionInvalid(args: { isHouseCoach: boolean; userId: string | null; cookie: string | undefined; pathname: string; now?: number }): Promise<boolean>;
  // admin-session.ts
  export async function startClubSession(admin: User, org: Organization, houseCoach: User): Promise<void>; // row + cookie + audit CLUB_SESSION_STARTED
  export async function endClubSession(): Promise<void>; // endedAt + delete cookie + audit CLUB_SESSION_ENDED
  export async function getActingAdmin(): Promise<ClubAdminMarker | null>; // verified marker or null
  // actions
  export async function enterClubAction(clerkOrgId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  export async function exitClubAction(): Promise<void>;
  ```
- Key derivation: same approach as `lib/clubs/join-token.ts` (read it) but label `"club-admin-session"` and Web Crypto HMAC so the proxy can import it. Secret default = derived from `process.env.CLERK_SECRET_KEY`.
- `houseCoachSessionInvalid`: returns false when `!isHouseCoach` or pathname starts with `/club-session/` or `/api/webhooks`; true when marker null, `marker.exp < now`, or `marker.houseCoachClerkId !== userId`.
- `proxy.ts`:
  ```ts
  export default clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req)) await auth.protect();
    const { userId, sessionClaims } = await auth();
    const isHouseCoach = (sessionClaims?.publicMetadata as { houseCoach?: boolean } | undefined)?.houseCoach === true;
    if (await houseCoachSessionInvalid({ isHouseCoach, userId, cookie: req.cookies.get(CLUB_ADMIN_COOKIE)?.value, pathname: req.nextUrl.pathname })) {
      return NextResponse.redirect(new URL("/club-session/ended", req.url));
    }
  });
  ```
  Verify `sessionClaims.publicMetadata` is populated (the app already reads it in `requireSuperAdmin`); if the session token lacks it, document that the Clerk session token template must include `"publicMetadata": "{{user.public_metadata}}"` in the handoff notes.
- `enterClubAction`: `requireSuperAdmin()` → load club (not a club → `{ok:false}`) → `ensureHouseCoach` → `startClubSession` → `client.signInTokens.createSignInToken({ userId: houseCoach.clerkId, expiresInSeconds: 60 })` → `{ ok: true, url: "/club-session/enter?ticket=" + encodeURIComponent(token.token) }`.
- Enter client (pattern from `claim-account.tsx`): one-shot ref; if signed in → `await clerk.signOut()` (from `useClerk`, no redirect: pass `{ redirectUrl: window.location.href }` ONLY if a no-redirect form is unavailable — check the v7 types) then `signIn.ticket({ ticket })` → `signIn.finalize()` → `router.replace("/dashboard")`. Error card links to `/admin/clubs`.
- Ended page: server reads `getActingAdmin()`; client calls `signOut({ redirectUrl: "/admin" })` automatically once, with a manual "Back to admin" button.

- [ ] **Step 1: Failing tests:** sign→verify roundtrip; tampered payload → null; tampered signature → null; expired → null; `houseCoachSessionInvalid` table: non-coach → false; coach + valid marker for same userId → false; coach + marker for other userId → true; coach + no cookie → true; coach on `/club-session/ended` → false. `enterClubAction`: when `requireSuperAdmin` redirects (mock throws `NEXT_REDIRECT`) → no Clerk/prisma calls; success → `adminClubSession.create` with `expiresAt` 8h ahead, cookie set httpOnly/secure/sameSite lax, sign-in token created with house coach clerkId, url returned. `exitClubAction` → `endedAt` set + cookie deleted.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement files above.
- [ ] **Step 4:** Run → PASS; existing `lib/auth/__tests__` public-route tests still pass (update if they snapshot the list); `npx tsc --noEmit`.
- [ ] **Step 5:** Leave uncommitted.

---

### Task 5: Manage-club UI + house coach shell

**Files:**
- Create: `app/admin/clubs/[orgId]/manage-club-button.tsx` (client; calls `enterClubAction`, then `window.location.assign(url)`; shows error toast/inline)
- Modify: `app/admin/clubs/[orgId]/page.tsx` (House coach card from Task 3 gets the button) and `app/admin/clubs/page.tsx` list rows (secondary "Manage" button)
- Create: `components/clubs/club-admin-banner.tsx` (client; props `{ clubName, adminName }`; Exit → `exitClubAction()` then `signOut({ redirectUrl: "/admin" })`)
- Modify: `app/(platform)/layout.tsx` (if `getActingAdmin()` returns a marker and the user is the house coach → render banner above the shell)
- Modify: settings tabs (`app/(platform)/settings/layout.tsx` + `hiddenNavHrefs` source) to hide the account/security tab for house coaches — add a `houseCoach` input to the existing hidden-href logic rather than a new branch; user menu "Sign out" → "Exit club" for house coaches (find the sidebar user menu in `components/layout/`).
- Modify: `syncHouseCoachProfile` call in `updateClub` when name/logo changes (H2).
- Tests: component test for banner Exit calling both; `updateClub` rename calls `syncHouseCoachProfile`.

- [ ] **Step 1:** Failing tests as listed.
- [ ] **Step 2:** Implement; use existing `Button`, design tokens (`bg-primary`, `text-primary-foreground`, etc.) — no raw palette.
- [ ] **Step 3:** Tests PASS, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 4:** Leave uncommitted.

---

### Task 6: Attribution (audit + messages)

**Files:**
- Modify: `lib/services/audit-log.service.ts` (`logUserAudit`: if `user` is the house coach of its org and `getActingAdmin()` returns a marker for that org → actor = `{ actorId: marker.adminUserId, actorType: "SUPER_ADMIN", actorName: marker.adminName }`, `metadata.viaHouseCoach = user.id`)
- Modify: `lib/services/message.service.ts` `sendMessage` accepts `sentByAdminId?: string | null`; `actions/message-actions.ts` and `actions/voice-message-actions.ts` pass `(await getActingAdmin())?.adminUserId ?? null` when the sender is a house coach
- Modify: trainer-side message bubble (`components/messages/message-thread.tsx`): when `message.sentByAdminId` and viewer is TRAINER, show small muted "sent by <name>" (load admin first names for the thread's distinct `sentByAdminId`s in `lib/services/inbox.service.ts`). Client-side payloads must NOT include `sentByAdminId` — strip it in the client thread serializer.
- Tests: `audit-log.service.test.ts` acting-admin case + normal trainer unchanged; `message-actions` test that house coach send stores `sentByAdminId`; client thread payload lacks the field.

- [ ] **Step 1:** Failing tests.
- [ ] **Step 2:** Implement (`getActingAdmin` uses `cookies()`; guard so `logUserAudit` never throws when called outside a request — wrap in the existing try).
- [ ] **Step 3:** PASS + tsc.
- [ ] **Step 4:** Leave uncommitted.

---

### Task 7: Admin alerts + needs-attention counts

**Files:**
- Create: `lib/services/club-alerts.service.ts`
- Modify: `lib/services/notification.service.ts` (`notifyUser`)
- Modify: `app/admin/layout.tsx` (upsert subscriber for the current admin), `components/admin/admin-sidebar.tsx` (+ mobile nav) badge on Clubs, `app/admin/clubs/page.tsx` (per-row count + mute toggle), `app/admin/clubs/[orgId]/page.tsx` stat strip
- Create: `actions/admin-club-alert-actions.ts` (`setClubAlertsMutedAction(muted: boolean)`)
- Tests: `lib/services/__tests__/club-alerts.service.test.ts`, extend `notification.service` tests

**Interfaces:**
```ts
export async function ensureClubAlertSubscriber(admin: Pick<User, "id" | "email">): Promise<void>; // upsert, never changes `muted`
export async function setClubAlertsMuted(userId: string, muted: boolean): Promise<void>;
export async function getClubAlertRecipients(): Promise<{ userId: string; email: string }[]>; // muted=false
export async function getClubAttentionCounts(): Promise<Map<string /* clerkOrgId */, number>>;
```
- Counts per club (H14): `message.count({ recipientId: houseCoachUserId, isRead: false, isInternal: false, ...nullOrUnset("deletedAt") })` + unreviewed `checkInResponse` whose assignment `trainerId === houseCoachUserId` and `isReviewed: false` + `memberCoaching.count({ clerkOrgId, status: "REQUESTED" })`.
- `notifyUser` change: after step 1 (in-app row), look up whether `input.userId` is a house coach (`organization.findFirst({ where: { houseCoachUserId: input.userId } })`). If so: skip the normal email to the house coach; for each recipient from `getClubAlertRecipients()` send the same template with `recipientName` = admin name and subject prefixed `[<club name>] `, using the registry entry, no preferences/cooldown on the admin side except the entry cooldown keyed on the house coach (already checked). All inside the existing try/catch.

- [ ] **Step 1: Failing tests:** subscriber upsert keeps `muted`; recipients exclude muted; zero recipients → no `sendEmail`, no throw; house coach recipient → `sendEmail` never called with the house coach address, called once per unmuted admin with `[Club] ` subject; non-house-coach recipient path unchanged; attention counts sum the three sources.
- [ ] **Step 2:** FAIL → implement → PASS; tsc; lint.
- [ ] **Step 3:** Leave uncommitted.

---

### Task 8: Migration script + handoff

**Files:**
- Create: `lib/db/scripts/migrate-club-trainers.ts` (follow the shape of the existing backfill script behind `npm run db:backfill-club-null-fields`: dry-run default, `--apply`, summary output)
- Modify: `package.json` (`"db:migrate-club-trainers": "tsx lib/db/scripts/migrate-club-trainers.ts"` — match the runner the other db scripts use)
- Create: `docs/superpowers/plans/2026-10-09-admin-managed-clubs-handoff.md` (rollout steps from spec §7, Clerk session-token note from Task 4, browser checklist)
- Test: `lib/db/scripts/__tests__/migrate-club-trainers.test.ts`

Per club (`type: "CLUB"`):
1. `ensureHouseCoach(org)` (apply only; dry run reports "would create").
2. Old trainers = `user.findMany({ clerkOrgId, role: "TRAINER", id: { not: houseCoach.id } })`.
3. For each: `transferClubOwnership(clerkOrgId, houseCoach.id)`; `checkInTemplate.updateMany({ trainerId: old.id } → houseCoach.id)`; `checkInAssignment.updateMany` same; `message.updateMany({ senderId: old.id } → houseCoach.id)` and `{ recipientId: old.id }`; `memberCoaching` untouched; then `removeOrgTrainer(clerkOrgId, old)`.
4. Print per-club counts; exported `migrateClubTrainers({ apply }: { apply: boolean }): Promise<Report>` for tests.

- [ ] **Step 1: Failing tests:** dry run → no writes, report lists club + counts; apply → writes in the order above; second apply with no old trainers → zero changes.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Full suite `TZ=UTC npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npx next build` all green.
- [ ] **Step 4:** Leave uncommitted.
