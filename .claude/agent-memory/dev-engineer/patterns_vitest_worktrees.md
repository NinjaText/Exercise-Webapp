---
name: patterns_vitest_worktrees
description: vitest run with relative test paths also matches identically-pathed files inside sibling .claude/worktrees/* copies, inflating file/test counts
metadata:
  type: project
---

This repo keeps multiple parallel git worktrees under `.claude/worktrees/<branch-name>/` (e.g. `audit-logging`, `assign-program-to-clinics`, `exercise-ai-multiphase-calendar-fix`, `admin-program-click-through`). Each worktree is a full checkout, so it contains files at the same relative path as the main repo (e.g. `actions/__tests__/bulk-exercise-actions.test.ts`).

When running `npx vitest run <relative-path>...` from the repo root, Vitest's glob resolution matches the same relative path inside every one of these worktree copies too — not just the main tree. This inflates the apparent "Test Files N passed" count (e.g. 3 target files becomes 12 matched files) even though nothing is broken.

**How to apply:** If a `vitest run` with explicit file paths reports far more test files than you passed in, don't treat it as a bug — rerun with `--reporter=verbose` and grep/inspect the file paths in the output to confirm the actual repo-root file (not a `.claude/worktrees/...` copy) passed. This is expected noise, not evidence of cross-worktree contamination or a config problem.

See also [[feedback_no_auto_commit]] — worktrees here are typically other in-flight, uncommitted feature branches; don't touch or "fix" test failures inside `.claude/worktrees/*` paths, they're out of scope for whatever main-repo task is active.
