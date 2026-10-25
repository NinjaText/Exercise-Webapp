---
name: patterns-client-component-action-tests
description: A "use client" component that imports a server-action file whose chain reaches a `server-only` module (e.g. org-capabilities.server) makes every vitest render of a parent component fail at import
metadata:
  type: project
---

Adding an action import to a client component (e.g. the dashboard's TodaysReflectionCard importing actions/journal-actions, which imports lib/org-capabilities.server → `server-only`) breaks the *parent's* existing render tests (client-dashboard*.test) with "This module cannot be imported from a Client Component module".

**Why:** Next handles action imports at build time, but vitest really imports the module graph, and `server-only` throws outside the react-server condition.

**How to apply:** when a client component gains an action import, grep for tests that render it or any parent and add `vi.mock("@/actions/<file>", () => ({ <action>: vi.fn() }))` — the established convention (see the coaching-actions mock in components/dashboard/__tests__). Run the full vitest suite, not just your own tests. Related: [[patterns-shared-helpers-client-server]].
