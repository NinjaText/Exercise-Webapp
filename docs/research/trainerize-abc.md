# ABC Trainerize: what it does and what matters for MIA Performance

_Research note, 2026-10-27. Sources are listed at the end. They are third-party reviews and press coverage, not Trainerize's own docs, so check details against a trial account before committing to anything._

## What it is

Trainerize is an online-coaching platform from Vancouver. ABC Financial (now ABC Fitness, a gym-management software company backed by Thoma Bravo) bought it in September 2020. It is now sold as **ABC Trainerize**, both standalone and as an add-on to ABC's club software. It describes itself as fitness, nutrition and habit coaching in one app. Clients use the iOS/Android app; trainers use a web dashboard or a trainer app. Capterra rates it 4.6 from about 700 reviews.

## Feature set

| Area | What Trainerize offers |
|---|---|
| Programming | Program builder with a drag-and-drop exercise library, templates, and an **AI workout builder**. One reviewer found its drafts about 60–70% done. Filmed demo library plus your own uploaded videos. |
| Client app | Workouts, meals, habits, check-ins and chat in one app. |
| Habits | Daily habits (water, steps, sleep, custom) with **streaks and badges**. |
| Nutrition | Photo, barcode and food-library logging, macro targets, compliance reports. **Smart Meal Planner** and a recipe library with scaled portions (paid add-on). |
| Messaging and automation | 1:1 and group chat. **Auto-messages**: welcome sequences, scheduled check-ins and re-engagement nudges, set per client or per program. One reviewer calls this the most-used feature. |
| Video | Built-in 1:1 and group video calls, which can be sold as paid sessions. |
| Payments and booking | Stripe one-off charges, memberships and packages. **Client self-booking** calendar synced with Google/Outlook. |
| Distribution | **Trainerize.me marketplace**, where prospects find trainers and buy starter packages. |
| Branding | Custom branded App Store / Play Store app: $169 one-off plus the Apple developer fee. |
| Integrations | Apple Health, Google Fit, Apple Watch, Fitbit, Garmin, Withings, MyFitnessPal, Zapier. |
| Pricing | Free (1 client), Grow $9/mo (2 clients), Pro from $23/mo (5 clients, scaling to 200), Studio Plus $248/mo per location. Add-ons (nutrition $20–45, video $10, payments $10, business $25) push a typical solo coach to about $80–165/mo. |

**Weak spots reviewers mention:** add-on pricing stacks up quickly, the trainer side takes real setup time, nutrition is only "adequate" next to dedicated tools, and some users report the app is slow.

## How MIA compares

**Features we already have:** program builder with templates and resources, AI program generation (including from uploaded documents), exercise library with videos, checklist and guided workout modes, habits with streaks, check-ins, nutrition logging with barcode scanning and a trainer macro calculator, messaging, daily reflections and a journal, follow-along video programs, Stripe Connect payments and a self-serve buy-a-program funnel, org branding, clubs, email notifications and a Capacitor mobile app.

**Where we're ahead:** reflections and the journal (Trainerize has nothing like them), clubs / multi-trainer orgs, document-to-program upload, and simpler all-in pricing compared with Trainerize's add-ons.

## Gaps worth considering (by expected value)

1. **Automated messages.** Welcome sequences, a nudge after N days with no workout or log, and check-in reminders tied to a program day. Reviewers single this out as what lets one coach handle a large client list. It fits naturally with our existing email notifications and program-day reflections. **Recommended next.**
2. **Wearable and health sync.** Apple Health and Google Fit for steps, sleep, heart rate and weight. The Capacitor app makes HealthKit and Health Connect possible, and the data would feed habits and progress views.
3. **Habit gamification.** Badges and milestones on top of our streaks. Cheap to build, and good for retention.
4. **Self-booking calendar.** Clients book 1:1 sessions in a trainer's open slots, with Google/Outlook sync. Only worth it if MIA trainers sell in-person or live sessions.
5. **Meal plans and recipes.** A large build, and it's what Trainerize charges extra for. Defer unless trainers ask for it.
6. **Group challenges / community.** Group chat or leaderboards per club. Fits the clubs model but is a larger product decision.
7. **Native video calls.** Low priority: trainers already use Zoom, and reviewers say Trainerize's version doesn't replace it.

Not recommended: a public trainer marketplace (a different business, which the self-serve funnel already covers for our own trainers) and per-trainer branded store apps (high operational cost for the store listings).

## Sources

- PT Pioneer, "Trainerize review": https://www.ptpioneer.com/personal-training/tools/trainerize-review/
- Capterra, ABC Trainerize: https://capterra.com/p/140262/Trainerize/
- Software Advice, ABC Trainerize profile: https://www.softwareadvice.com/fitness/trainerize-profile/
- Thoma Bravo, "ABC Financial acquires Trainerize": https://www.thomabravo.com/press-releases/abc-financial-acquires-trainerize-accelerating-a-mobile-first-total-fitness-experience-for-workouts-personal-training-nutrition-and-lifestyle-coaching
- Club Solutions, "Inside ABC Financial's acquisition of Trainerize": https://clubsolutionsmagazine.com/2020/09/inside-abc-financials-acquisition-of-trainerize/
