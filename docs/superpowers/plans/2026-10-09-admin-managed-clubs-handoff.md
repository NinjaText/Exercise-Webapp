# Admin-managed clubs: rollout handoff

Do these in order, in every environment (dev, then prod).

1. **Schema.** `npx prisma db push && npx prisma generate`
   (adds `Organization.houseCoachUserId` index and the `AdminClubSession` collection).

2. **Clerk session token.** Clerk dashboard -> Sessions -> Customize session token must include:
   ```json
   { "publicMetadata": "{{user.public_metadata}}" }
   ```
   Set it in every environment, **before deploying** this change. The proxy guard reads the role from this claim. Pages (`getCurrentUser`) and server actions (`activeCallerOnly`) have a fail-closed server backstop that looks the house coach up in the DB, but the proxy is the **only** guard for route handlers that call `auth()` directly (e.g. the Stripe checkout/portal routes). Without the claim, a stale house-coach session can still reach those routes.

   Also confirm the house coach's email address (`house-coach+<org id>@<RESEND_FROM_EMAIL domain>`) cannot receive mail (no catch-all / plus-addressing inbox on that domain), or disable email-code / magic-link sign-in for these users in Clerk. Otherwise anyone who can read that inbox can sign in as the house coach.

3. **Migrate club trainers to the house coach.**
   ```
   npm run db:migrate-club-trainers            # dry run, writes nothing
   npm run db:migrate-club-trainers -- --apply # write
   ```
   Per club it creates the house coach, then for each old trainer: transfers programs/templates, moves check-in templates/assignments and messages, removes the trainer from Clerk and deactivates them. It also revokes pending Clerk invitations with `publicMetadata.invitedRole === "TRAINER"`. A failed club is logged in the report, the script continues, and the exit code is non-zero. It also hands each old trainer's remaining owned data to the house coach: every program they own (not just member copies and starters), clinical notes, pending program assignments, collections (a name clash with the house coach's collection is renamed `<name> (<old trainer>)`) and habit definitions. Re-running is safe (idempotent). Review the dry-run output first.

   **Check prod for legacy club trainers' data before `--apply`:** the dry run reports per club how many owned programs, clinical notes, pending assignments, collections and habits would move. Confirm those numbers look right (in particular that no old trainer owns data that belongs to a different, non-club practice) before writing.

4. **Alerts.** Each super admin opens `/admin` once so they are subscribed to alerts.
   Only new member messages, check-in responses, voice notes and coaching requests are emailed to admins; other house-coach notifications are in-app only. The cooldown is per club per type (e.g. at most one new-message email per club per hour); the attention badge in `/admin/clubs` shows the rest. Each email's button links to that club's admin page. Recipients are re-checked as super admins (SUPER_ADMIN_EMAILS or Clerk `publicMetadata.superAdmin`) at send time; a subscriber who no longer qualifies is removed.

5. **Browser checklist.**
   - Admin -> Manage club -> the managing banner shows.
   - Reply to a member: the member sees the sender as "Coach"; the staff thread shows "sent by ...".
   - Review a check-in.
   - Edit a member's program.
   - Exit returns to `/admin`.
   - Check the banner at phone width.
   - A house-coach tab left open past 8 hours is signed out.

## Known limitations

- Clerk single-session: the admin has to sign in again after Exit unless multi-session is enabled in Clerk.
- The house coach avatar does not follow logo changes made via the branding page (it syncs only through the house-coach profile sync).
