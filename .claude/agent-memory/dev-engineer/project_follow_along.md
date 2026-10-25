---
name: project-follow-along
description: Follow-along video programs (2026-10-22) — zero-block video workouts; every workout copy path must carry videoUrl/videoDurationSec + Program.contentFormat
metadata:
  type: project
---

Follow-along programs (Program.contentFormat = "FOLLOW_ALONG") store one zero-block Workout per day with
Workout.videoUrl / videoDurationSec; rest days have no row. Built 2026-10-22 on branch club-orgs, uncommitted;
the schema fields need the user's own `prisma db push`.

**Why:** assigning a template clones it, so any copy path that omits the video fields silently turns video days
into empty workouts. Plain programs legitimately save zero-block workouts, so the "zero blocks needs a video"
rule is only enforced when the program is follow-along (validators/program.ts getFollowAlongWorkoutIssues).

**How to apply:** when adding a new workout copy/duplicate path or a new session/calendar select, include
videoUrl/videoDurationSec (and contentFormat on program copies); render via isVideoWorkout()/formatWorkoutMetaLine's
video arg instead of exercise counts. Completion goes through finalizeSessionCompletion in session-v2-actions.ts.
