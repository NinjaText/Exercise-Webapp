# Memory Index

- [project_stack.md](project_stack.md) — Tech stack, architecture decisions, and build-verified patterns for the RehabAI exercise platform
- [feedback_no_auto_commit.md](feedback_no_auto_commit.md) — User wants code changes only, never auto-commits (even when a plan lists a commit step)
- [patterns_payment_model.md](patterns_payment_model.md) — Two billing models (platform vs client-billing, latter unpopulated), org-scoping convention, V1/V2 session models
- [patterns_mongo_type_queries.md](patterns_mongo_type_queries.md) — Mongo query-lang $type matches array elements not just field type; use $expr+$type for idempotent backfill filters
- [patterns_vitest_worktrees.md](patterns_vitest_worktrees.md) — vitest run also matches same-path files in .claude/worktrees/* copies, inflating file/test counts (not a bug)
- [patterns_local_type_duplication.md](patterns_local_type_duplication.md) — components/pages re-declare Prisma field shapes locally instead of importing; use `tsc --noEmit` full-pass, not iterative `next build`, to find every stale copy during a schema migration
