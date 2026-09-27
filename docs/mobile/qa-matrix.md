# Inmotus RX mobile — device QA matrix

This is the manual test pass for real devices before each store submission: one physical iPhone and one Android phone. It starts from spec §12 ([`docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md`](../superpowers/specs/2026-09-20-mobile-app-capacitor-design.md)) and has been updated to match what was actually built.

**Build to test:**

- iOS: a **TestFlight** build (or an Xcode Release build signed by the company team).
- Android: a build installed from the Play **internal testing** track, or a signed release synced *with* `google-services.json`.

Push, universal links and App Links only work on those builds. A free-Apple-ID Debug build has no push and no https links (README §12–13).

**Changes from the spec matrix:**

- The app-icon badge is gone. v1 has no badge (push plan deviation 3).
- "Print opens system browser" now reads "Print opens the share sheet" (`components/programs/program-detail-view.tsx`).
- "Rotate theme light/dark" is replaced by a status-bar legibility check. The web app has no dark theme (there is no `ThemeProvider`), and the status bar style is fixed to `LIGHT` ([`lib/native/lifecycle.ts`](../../lib/native/lifecycle.ts)).
- Progress-photo upload is out. There is no client upload control: `addProgressPhotoAction` has no caller. Only the meal photo is tested (see [known-issues.md](known-issues.md)).
- `/p/<slug>` links no longer open the app. `/p` was removed from the deep-link list. The item now checks the page inside the app, reached from a message link.
- Rows 22–27 are new: sign-in device checks, the attention screen and the trainer pass.

Fill the result columns with ✅ / ❌ plus a note. Record the build number at the top of your copy.

| Build | iOS: | Android: |
|---|---|---|
| Tested by / date | | |

## Matrix

| # | Area | Steps | Expected | iOS result | Android result |
|---|---|---|---|---|---|
| 1 | Launch | Cold start with network, signed in | The splash (brand colour) shows, then the dashboard. No long white blank | | |
| 2 | Launch | Cold start signed out | Opens on `/sign-in`, not the marketing landing page with prices (`lib/native/landing.ts`) | | |
| 3 | Offline | Airplane mode on, cold start | "You're offline" page appears. Turn the network back on and tap **Try again**, or wait for the automatic retry (about 10 s while online) | | |
| 4 | Offline | In a session, toggle airplane mode | A thin "No internet connection" banner appears, then disappears when back online. Typed input is not lost after a resume | | |
| 5 | Sign-in | Open sign-in and sign-up | Email fields only. No Google/social buttons and no "or" divider | | |
| 6 | Sign-in | Sign in with email and password (and the email code, if enabled). Sign out from the avatar menu | Stays inside the app throughout. It never jumps to Safari or Chrome | | |
| 7 | Sign-in | Sign in as the trainer, sign out, then sign in as the client on the same phone. Send the client a push-triggering event (a message from the trainer on another device) | Only the account signed in now gets the push. The previous account's pushes stop on this phone | | |
| 8 | Push | Visit the dashboard a second time after onboarding | A bottom sheet reads "Get reminders for workouts and messages". **Turn on** raises the OS prompt. Dismissing it keeps it gone for good | | |
| 9 | Push | App in foreground, receive a message | An in-app toast with a **View** action appears and there is no system banner. View opens the thread | | |
| 10 | Push | App in background or locked, receive a message | A system banner "New message" says "{name} sent you a message." **No badge** on the app icon | | |
| 11 | Push | Force-quit the app, then tap a push | The app cold-starts on the linked page (for example Inbox), not just the dashboard | | |
| 12 | Push | Settings → Notifications → switch push off, then trigger a message. Switch it on again | Off: no push arrives. On: pushes resume. If the OS permission is undecided, the switch raises the OS prompt; if denied, a hint appears | | |
| 13 | Messages | Open a thread on the phone and send from another device | New messages appear live (Pusher) without a refresh | | |
| 14 | Voice | Record a voice note in a thread, send it, play it back | The microphone permission prompt appears **once**. Playback works | | |
| 15 | Media | Open an exercise with a video | The video plays inline (YouTube no-cookie embed) | | |
| 16 | Share | Trainer: program → ⋯ → **Download PDF**. Then **Print** | Both open the native share sheet with the PDF. Cancelling the sheet shows no error toast | | |
| 17 | Links | Tap an external link (for example on `/privacy`, or any off-site link) | Opens in the in-app browser sheet; the app page stays put | | |
| 18 | Photos | Client: Nutrition → log a meal → **AI Photo** from the camera, then again from the library | The camera and photo permission prompts appear, the photo uploads, and draft foods are filled in | | |
| 19 | Haptics | Client: complete a set in a workout; submit a check-in | A light tap is felt | | |
| 20 | Billing | Trainer menu, More sheet and Settings | There is no **Billing** entry anywhere, and no "Upgrade" prompt or price on any screen | | |
| 21 | Billing | Open a trainer's `/p/<slug>` sales link in the app (paste it into a message and tap it) | Program details, then "This program is available on our website." No price and no Buy button | | |
| 22 | Attention screen | Sign in as a trainer whose trial has expired, or whose status is `CANCELED` / `PAST_DUE` (a test account on a preview deployment, never a real customer) | Full-screen "Your subscription needs attention" with one sentence, no price, no URL, no button except **Sign out**. Sign out works. Nothing behind it is reachable | | |
| 23 | Sign-in (device) | README §9: Settings → profile | The Clerk "Connected accounts" (Google) section is hidden | | |
| 24 | Sign-in (device) | README §9: sign in → "Use another method" with a Google-linked account | No Google option is offered | | |
| 25 | Sign-in (device) | README §9: reverification (for example, change password) on a Google-only account | Completes or fails cleanly without leaving the app for Google | | |
| 26 | Deep links | From an email or Notes, tap `https://app.goinmotus.com/messages` and `inmotus://dashboard` | The app opens on that page. A `/settings/billing` or `/p/...` https link opens in the **browser**, not the app | | |
| 27 | Trainer pass | Signed in as a trainer, run **all of** [`mobile/README.md` §15 "Trainer phone QA (390 px)"](../../mobile/README.md#15-trainer-phone-qa-390-px): Tier 1, Tier 2, Tier 3 notices and touch sizing | Every item passes; no screen scrolls sideways | | |
| 28 | Android back | Navigate three screens deep, then press system back repeatedly | Goes back through history, then exits the app. Nothing gets stuck | | |
| 29 | iOS gestures | Swipe from the left edge | No swipe-back (acceptable); the in-app back controls work | | |
| 30 | Status bar | Light and dark system appearance on the device | Status bar text stays legible over the header and content isn't under the notch or home indicator | | |
| 31 | Keyboard | Type in the message composer, the meal log and the sign-in fields | The focused input scrolls into view and the page does not zoom on focus | | |
| 32 | Version gate | On a **preview** deployment, set `MOBILE_MIN_VERSION_*` above the build's version and redeploy. Point a QA build at it (`CAP_SERVER_URL`) | The full-screen "Update required" appears. The store button shows only if `NEXT_PUBLIC_*_STORE_URL` is set. Restore the value afterwards | | |
| 33 | Deletion | Client test account: Settings → **Delete my account** → type `DELETE` → **Delete account** | Lands on `/account-deleted`. The old credentials no longer sign in, and pushes to that phone stop | | |
| 34 | Deletion | Trainer test account with active clients | The dialog lists the blocker with a **Go to clients** link and nothing is deleted | | |
| 35 | Errors | Force a server error page (for example, visit a deleted program id) | The error page renders with a working **Try again** / navigation | | |
| 36 | Orientation | Rotate the phone to landscape on a few screens | Usable, nothing clipped. Landscape stays enabled on purpose (shell plan ruling 5) | | |

## Notes

- Rows 7–12 need the server push env vars set and the owner's `npx prisma db push` applied ([release-checklist.md](release-checklist.md) §2–3).
- Row 26: the https half needs `APPLE_TEAM_ID` and `ANDROID_SHA256_CERT_FINGERPRINTS` set and a redeploy. `inmotus://` works on any build.
- Row 32: don't raise the minimum on Production for this test. It would lock out every installed app.
- Rows 33–34: use throwaway accounts, not the App Review demo accounts.
