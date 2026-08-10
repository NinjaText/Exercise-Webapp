# Feature Design: YouTube Exercise Discovery (Search mode + context-aware metadata)

## Overview

Trainers can already bulk-import exercises from YouTube in two ways on `/exercises/bulk-import`: pasting raw video URLs, or pasting a playlist URL (which fetches every video in the playlist into a thumbnail grid with checkboxes, batch-generates AI metadata for the selected ones, then lets the trainer review/edit before publishing). What's missing is going from a *niche* ("marathon runner strength exercises") to a list of candidate videos — today the trainer has to already have a playlist or a list of URLs in hand.

This adds a third mode, "Search," that reuses the exact same grid-select-generate-review-publish pipeline the Playlist mode already has, just sourcing its candidate list from a YouTube keyword search instead of a playlist ID. It also fixes a bias discovered along the way: the AI metadata-generation prompt is hardcoded for "senior rehabilitation and geriatric fitness," which would mislabel real athletic-training content (e.g. calling a plyometric drill a geriatric PT exercise).

## Part 1 — Search mode

### Backend: `app/api/youtube/search-videos/route.ts` (new)

Mirrors the existing `app/api/youtube/playlist-videos/route.ts` almost exactly (same auth checks: Clerk session → TRAINER role or super admin):

- `GET /api/youtube/search-videos?q=<query>`
- Calls YouTube Data API v3 `search.list` (`part=snippet&type=video&q=<query>&maxResults=25&key=<YOUTUBE_API_KEY>`).
- Returns `{ videos: [{ videoId, title, channelTitle, thumbnailUrl, videoUrl }], total }` — same shape as the playlist route's response plus `channelTitle`, which the UI shows so trainers can judge source credibility (search results are far less trustworthy than a playlist someone already curated).
- **No auto-pagination.** `search.list` costs 100 quota units per call vs. 1 unit for `playlistItems.list`/`videos.list` — the playlist route loops to fetch up to 200 results because that's cheap; search does not loop and returns a single page (~25 results). If a trainer wants more/different results, they re-search with different terms rather than triggering a second expensive page fetch automatically.

### Frontend: `components/exercises/bulk-import-form.tsx`

- Add a third mode button ("Search") next to "YouTube URLs" and "From Playlist," with a text input (placeholder: `"e.g. marathon runner strength exercises"`) and a "Search" button calling the new route.
- **Extract the existing playlist video-grid (thumbnail + checkbox + title, select-all/deselect-all, 30-video cap) into a shared component** (`VideoSelectionGrid` or similar, colocated in this file or a new small file) — both Playlist and Search modes render it with their respective fetched video list. This removes the need to duplicate ~60 lines of JSX and keeps the two modes visually/behaviorally identical.
- **Key UX difference from Playlist mode: nothing is pre-selected.** Playlist mode defaults to select-all because the trainer already curated that playlist; Search mode defaults to an empty selection because raw keyword search results are noisy (expect race vlogs, nutrition content, and interviews mixed in with real drills) — the trainer must deliberately pick.
- From there, selected videos flow through the exact same `processUrlBatch` → review rows → `handlePublish` pipeline already in this file. No changes needed there.

## Part 2 — Exercise Context toggle (fixes the geriatric-rehab bias)

### `app/api/ai/generate-exercise-metadata/route.ts`

- Accepts an optional `context: 'CLINICAL' | 'PERFORMANCE'` field on the request body (both the `youtubeUrl` flow and the name-only flow), **defaulting to `'CLINICAL'`** so existing behavior is unchanged for any caller that doesn't send it.
- Two system prompts, selected by `context` (mirrors the `CLINICAL_PLAN_SYSTEM_PROMPT`/`PERFORMANCE_PLAN_SYSTEM_PROMPT` split already built in `lib/services/ai.service.ts` this session):
  - `CLINICAL` (current text, unchanged): *"You are an expert physical therapist specializing in senior rehabilitation and geriatric fitness. Clients are typically older adults (60+)..."*
  - `PERFORMANCE` (new): an expert strength & conditioning coach persona producing metadata appropriate for athletes/general fitness — no age/rehab framing, difficulty defaults not skewed toward BEGINNER, contraindications framed as training-safety cautions rather than medical conditions.
- The response schema itself (`bodyRegion`, `exercisePhases`, `equipmentRequired`, etc.) is unchanged — only the system prompt persona and the tone it produces for free-text fields (description, instructions, commonMistakes) differs.

### Frontend: two call sites get the same small toggle

- `components/exercises/bulk-import-form.tsx`: one page-level "Exercise Context" toggle (Rehab/Clinical vs. Athletic/Performance, default Clinical) that applies to every AI metadata call made during that import session — URL paste, playlist, and search modes alike, plus the per-row "Regenerate" button.
- `components/programs/exercise-picker-dialog.tsx`: same toggle added to the "AI Generate" tab of the create-exercise modal, for the single-video flow.
- Both simply add `context: selectedContext` to the existing `fetch("/api/ai/generate-exercise-metadata", ...)` calls — no other wiring changes.

## Out of scope

- Deduping newly-generated exercises against the existing library before publish — this gap already exists in today's Playlist mode; not introduced or worsened by this change, and not fixed here either. Separate follow-up if wanted.
- Auto-pagination / "load more" for search results — v1 is a single page per search; re-searching with adjusted terms is the intended way to get different results.
- Any change to the metadata *schema* (fields returned) — only the persona/tone differs by context, not the shape of the data.

## Testing

- Manual: run a Search-mode query for a niche topic, confirm results show thumbnail/title/channel with nothing pre-checked, select a few, generate, confirm rows populate; run a Playlist-mode import to confirm the extracted shared grid component didn't regress that flow.
- Manual: toggle Exercise Context to Performance, generate metadata for an athletic video, confirm the description/instructions read as athletic coaching rather than geriatric PT language; confirm leaving it on the default (Clinical) reproduces today's existing behavior unchanged.
- No new unit-testable pure logic beyond what's already covered (this is primarily API wiring + UI) — no new test files planned.
