# Admin-Managed Clubs (House Coach + "Manage club") — Design

**Date:** 2026-10-09
**Replaces:** the per-club trainer parts of `docs/superpowers/specs/2026-10-01-club-trainer-and-coaching-design.md` (D2–D5, D8). Coaching add-on (D10–D15) stays.
**Status:** Design approved in chat 2026-10-09.

## 1. Goals

1. Platform admins (super admins) manage every club. There is no per-club trainer and no trainer invite.
2. Each club has one built-in **house coach** account that owns club content and is the "Coach" members talk to.
3. Admins click **Manage club** in `/admin/clubs/[orgId]` and land in that club's normal trainer portal (inbox, voice notes, check-ins, program editor, activity, coaching requests). Nothing is rebuilt inside `/admin`.
4. Every action taken inside a club is attributable to the real admin.
5. Admins learn about coaching work through a per-club "needs attention" badge and email alerts.
6. Trainer orgs (non-club) behave exactly as today.

## 2. Decisions

| # | Decision |
|---|---|
| H1 | One **house coach** per club: a real Clerk user (no password), member of the club Clerk org (`org:admin`), DB `User` with role TRAINER, `onboarded: true`. Linked by `Organization.houseCoachUserId`. Clerk `publicMetadata: { houseCoach: true, clerkOrgId }`. |
| H2 | House coach identity shown to members: first name `Coach`, last name = club name; image = club logo when set. Name follows club renames. |
| H3 | House coach email: `house-coach+<clerkOrgId>@<domain>` where domain is the domain of `RESEND_FROM_EMAIL` (fallback: the `DEFAULT_FROM` domain in `lib/email/send.ts`). Never emailed (see H11). |
| H4 | House coach created in `createClub` (rollback on failure, same as prices). Existing clubs get one via `ensureHouseCoach(org)`, which is idempotent and also called lazily wherever the club's coach is required, and by the backfill script. |
| H5 | `getClubTrainer()` is replaced by `getHouseCoach(clerkOrgId)` (reads `houseCoachUserId`). Ownership, starter/resource validation, coaching requests all use it. A club is **open to join as soon as it exists**; the "club isn't open yet" gate is removed. |
| H6 | **Enter club** uses a Clerk **sign-in token** (not Clerk impersonation, which is capped at 5/month without a paid add-on). Server action `enterClubAction(clerkOrgId)`: `requireSuperAdmin()` → `ensureHouseCoach` → create `AdminClubSession` row → set signed `club_admin_session` cookie → create 60s sign-in token → return `/club-session/enter?ticket=…`. |
| H7 | `/club-session/enter` (public route; the ticket is the credential) is a client page: sign out the current session (admin), sign in with the ticket strategy, `setActive`, navigate to `/dashboard`. Errors show a message + link back to `/admin/clubs`. |
| H8 | **Marker cookie** `club_admin_session`: `base64url(JSON{sid, adminUserId, adminName, clerkOrgId, houseCoachClerkId, exp})` + `.` + HMAC-SHA256, key derived from `CLERK_SECRET_KEY` with label `club-admin-session` (same pattern as `lib/clubs/join-token.ts`). httpOnly, secure, sameSite=lax, path `/`, max 8h. |
| H9 | **Guard** in `proxy.ts`: when `sessionClaims.publicMetadata.houseCoach === true` and the marker is missing, invalid, expired, or its `houseCoachClerkId !== userId` → redirect to `/club-session/ended` (public route), which signs out and links to `/admin`. No DB access in the proxy. |
| H10 | **Exit**: banner button → `exitClubAction()` sets `AdminClubSession.endedAt`, clears the cookie, client `signOut({ redirectUrl: "/admin" })`. Admin signs back in unless Clerk multi-session is on. |
| H11 | **Attribution**: `logUserAudit` / `auditActor` resolve the acting admin when the user is a house coach: actor = admin (`SUPER_ADMIN`), `metadata.viaHouseCoach = houseCoachUserId`, `orgId` = club. New audit actions `CLUB_SESSION_STARTED`, `CLUB_SESSION_ENDED`. `Message.sentByAdminId String? @db.ObjectId` is set when a house coach sends; trainer-side thread shows "sent by <admin first name>"; members never see it. |
| H12 | **House coach UI**: banner "Managing <club> as <admin> · Exit" in the platform shell; settings hides Billing (already) and the Account/security tab; user menu "Sign out" replaced by "Exit club". |
| H13 | **Alerts**: `notifyUser()` with a house-coach recipient keeps the in-app notification on the house coach, skips the house-coach email, and sends the same email to every unmuted `ClubAlertSubscriber`. Subscriber rows are upserted for each super admin when they load `/admin` (layout). A mute toggle lives on `/admin/clubs`. |
| H14 | **Needs attention** per club = unread non-internal messages to the house coach + unreviewed `CheckInResponse`s on house-coach assignments + `MemberCoaching` in `REQUESTED`. Shown on `/admin/clubs` list rows, the club detail stat strip, and a total badge on the admin sidebar "Clubs" item. |
| H15 | **Removed**: club trainer email field (new club), resend/replace controls, `/onboarding/club-trainer` page + action + form, trainer-invite handling in the Clerk webhook, `hasClubTrainerInvite`/`resolveClubTrainerInvite` checks in onboarding, `CLUB_NOT_OPEN_MESSAGE` gate. `transferClubOwnership` is kept (used by migration). |
| H17 | The Clerk webhook ignores users/memberships whose Clerk `publicMetadata.houseCoach === true` (the row is created by `ensureHouseCoach`, never by the webhook or onboarding). |
| H16 | **Migration** `npm run db:migrate-club-trainers` (dry-run default, `--apply`): per club, ensure house coach; for every other TRAINER in the org: transfer programs/templates (`transferClubOwnership`), reassign `CheckInTemplate.trainerId`, `CheckInAssignment.trainerId`, and `Message.senderId/recipientId` that point at the old trainer; then remove Clerk membership + deactivate (existing `removeClubTrainer` logic). Also backfills house coaches for clubs that have none. |

## 3. Data model

```prisma
model Organization {
  // ...
  /// Club-only. The built-in house coach User (H1). null until ensureHouseCoach runs.
  houseCoachUserId String? @db.ObjectId
}

model Message {
  // ...
  /// Set when a house coach sends: the super admin actually typing (H11).
  sentByAdminId String? @db.ObjectId
}

/// One row per admin "Manage club" visit (H6, H10).
model AdminClubSession {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  adminUserId      String    @db.ObjectId
  clerkOrgId       String
  houseCoachUserId String    @db.ObjectId
  startedAt        DateTime  @default(now())
  expiresAt        DateTime
  endedAt          DateTime?

  @@index([clerkOrgId, startedAt])
  @@index([adminUserId])
}

/// Super admins who receive club coaching alert emails (H13).
model ClubAlertSubscriber {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @unique @db.ObjectId
  email     String
  muted     Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Mongo caveats: `houseCoachUserId`, `sentByAdminId`, `endedAt` are optional and NOT `@unique`; filters for "null" use `nullOrUnset` (`lib/db/mongo-null.ts`). Create rows with explicit nulls.

## 4. Units

| Unit | Purpose |
|---|---|
| `lib/services/house-coach.service.ts` | `houseCoachEmail`, `ensureHouseCoach(org)`, `getHouseCoach(clerkOrgId)`, `isHouseCoach(user)`, `syncHouseCoachProfile(org)` |
| `lib/clubs/admin-session-token.ts` | sign/verify marker (pure, Web Crypto so it runs in `proxy.ts`) |
| `lib/clubs/admin-session.ts` | `startClubSession`, `endClubSession`, `getActingAdmin()` (reads + verifies cookie; server only) |
| `actions/admin-club-session-actions.ts` | `enterClubAction`, `exitClubAction` |
| `app/club-session/enter/page.tsx` | ticket sign-in client page |
| `app/club-session/ended/page.tsx` | public page that signs out the stale house-coach session |
| `components/clubs/club-admin-banner.tsx` | banner + Exit |
| `lib/services/club-alerts.service.ts` | subscribers upsert/mute, fan-out, `getClubAttentionCounts()` |
| `lib/db/scripts/migrate-club-trainers.ts` | H16 |

## 5. Error handling

- `createClub`: house-coach failure rolls back the org, Clerk org and prices, and throws `ClubError("house_coach_failed")`.
- `enterClubAction`: non-admin → redirect `/dashboard`; Clerk token failure → `{ ok: false, error }` shown on the club page.
- Enter page: ticket failure → message + link to `/admin/clubs`; the half-started `AdminClubSession` simply expires.
- Guard redirects never loop: `/club-session/(.*)` is a public route and is excluded from the guard.
- Alerts: fan-out failures are logged and swallowed (`notifyUser` never throws).

## 6. Testing

Unit (vitest, `TZ=UTC`): `ensureHouseCoach` create + idempotent + profile sync; `houseCoachEmail`; marker sign/verify/expiry/tamper/wrong-user; `enterClubAction` refuses non-admins and creates session + token; `getActingAdmin`; audit attribution when house coach; `notifyUser` fan-out (muted skipped, house coach not emailed); attention counts; migration dry-run vs apply; createClub without trainer email + rollback; join no longer gated; existing club/coaching tests moved from trainer to house coach. Browser: admin → Manage club → reply to a member → review a check-in → Exit.

## 7. Rollout

1. `npx prisma db push && npx prisma generate`.
2. `npm run db:migrate-club-trainers` (dry run), review, then `--apply`.
3. Super admins open `/admin` once to subscribe to alerts.
