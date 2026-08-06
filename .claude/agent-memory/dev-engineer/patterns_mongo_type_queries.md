---
name: patterns-mongo-type-queries
description: MongoDB query-language $type matches array elements, not just the field's own type — bit devs when filtering/migrating array-typed Prisma fields
metadata:
  type: project
---

When writing raw Mongo queries (`$runCommandRaw`, or any query-language filter) against a field
that is or might become an array, `{ field: { $type: "string" } }` matches if **any element** of
an array field has that type — not just when the field itself is a scalar string. This is
standard MongoDB behavior for implicit array traversal in query-language operators, but it's easy
to forget when writing "does this field still have the old scalar shape" migration filters.

**Concretely bit us:** `Exercise.bodyRegion` migration (single enum -> `BodyRegion[]`,
`lib/db/seed/migrate-body-region-to-array.ts`). The brief's original filter
`{ bodyRegion: { $type: "string" } }` correctly matched scalar docs on the first run, but on a
second run it *still* matched already-migrated array docs like `["CORE"]` (because the array
contains a string element), silently double-wrapping them into `[["CORE"]]`. Verified this by
inserting a throwaway scalar test doc and round-tripping the script twice — first run converts
correctly, second run (with the buggy filter) corrupts.

**Fix:** use `$expr` with the aggregation-pipeline `$type` operator instead, which checks the
field's own stored type, not its elements:
```js
q: { $expr: { $eq: [{ $type: "$fieldName" }, "string"] } }
```
This is the reliable way to write an idempotent "only matches un-migrated scalar docs" filter for
any future one-off Mongo backfill script in this repo (`lib/db/seed/*.ts` pattern).

**How to apply:** Any future backfill/migration script here that converts a scalar Prisma field to
an array (or otherwise needs a type-based idempotency filter) should use the `$expr`/aggregation
`$type` form, not the bare query-language `$type` shorthand. Also: always test idempotency by
running the script twice against real data (or a throwaway test doc) before considering a backfill
script done — don't trust a script's own docstring claim of idempotency without verifying it.

Related: this repo's multi-region migration plan (`.superpowers/sdd/2026-08-06-multi-region-equipment-edit/`)
is a 10-task plan converting `Exercise.bodyRegion` from enum to array; Task 1 (schema + backfill)
is where this was found. Later tasks (service-layer queries, filters) should double check any
Mongo-level filtering on `bodyRegion` for the same element-vs-field type-matching trap.
