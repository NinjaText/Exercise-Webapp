---
name: patterns-shared-helpers-client-server
description: Where a pure helper must live so both client components and server actions can use it — lib/services/* is server-only (Prisma) and is fully vi.mock'd in action tests
metadata:
  type: project
---

When a small pure helper (e.g. `getProgramSchedulingType`) is needed by **both** client
components and server code, it must live in `lib/utils/*.ts`, not in `lib/services/*.ts`.

**Two independent reasons, both confirmed:**

1. **Bundle boundary.** Every `lib/services/*.service.ts` imports `@/lib/prisma` at module scope.
   Client components in this repo therefore only ever `import type { ... }` from a service —
   grep confirms it: `components/programs/program-list-client.tsx` (`type ProgramProgress`),
   `components/exercises/exercise-grid.tsx` (`type getExercisesPage`),
   `components/dashboard/week-workouts-card.tsx` (`type ClientMetrics`). A *value* import from a
   service into a `"use client"` file drags PrismaClient into the browser bundle.

2. **Action tests mock the whole service module.** `actions/__tests__/program-actions-audit.test.ts`
   and `actions/__tests__/admin-program-actions.test.ts` do a bare
   `vi.mock("@/lib/services/program.service")`, so *any* new export the action calls through the
   `programService.*` namespace fails at runtime with
   `No "<name>" export is defined on the ... mock`. Calling the helper via a direct import from
   `lib/utils/...` sidesteps this entirely — no test-mock churn needed.

**How to apply:** put the canonical implementation in `lib/utils/<topic>.ts`, then
`export { helper } from "@/lib/utils/<topic>"` from the service if server callers expect to find it
there. Import it from `@/lib/utils/...` at every call site (actions, pages, components); reserve the
service namespace for functions that actually touch the DB.

Related: [[patterns_local_type_duplication]] — the same files are where duplicate local types cluster.
