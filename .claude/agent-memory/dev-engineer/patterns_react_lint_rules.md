---
name: patterns-react-lint-rules
description: Repo lint rules that reject common React/Clerk idioms — setState in effects is an ERROR, and Clerk metadata types need an index signature
metadata:
  type: project
---

`npx eslint` in this repo enforces `react-hooks/set-state-in-effect` as an **error**, not a warning.
Any `useEffect(() => { setLoading(true); ... })` fails lint. `tsc --noEmit` and `next build` both
pass it, so lint has to be run separately on changed files before calling work done.

**Why:** the repo uses the React Compiler-era eslint-plugin-react-hooks ruleset, which treats
synchronous setState inside an effect body as a cascading-render bug.

**How to apply:** two sanctioned workarounds, both used in `components/dashboard/`:
- *Reacting to a changed prop* — adjust state during render with a "last handled value" state var
  (`if (signal !== handled) { setHandled(signal); setOther(...) }`), as in
  `todays-priorities-card.tsx`'s `expandSignal`. Passes lint; effects do not.
- *Fetch on open* — extract the fetching subtree into its own component, seed `useState(true)` for
  loading, and mount it conditionally (`{open && <Panel />}`), as in `pending-feedback-sheet.tsx`.
  The mount effect then has no synchronous setState.
- *Reading localStorage* — use `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`
  with a module-level `Set<() => void>` of listeners, as in `components/programs/client-programs-view.tsx`
  (`QuickTipCallout`). Lint-clean AND hydration-safe: the server snapshot is what SSR and the
  hydrating render use, so there's no mismatch. `useEffect(() => setX(localStorage...))` fails lint;
  a lazy `useState` initializer reading `window` breaks SSR.

Unrelated but same verification pass: Clerk's `OrganizationInvitationPublicMetadata` is
`{ [k: string]: unknown }`, so a typed metadata interface must declare an index signature or it
won't be assignable to `createOrganizationInvitation`'s params (see
`actions/invite-client-action.ts`).

Related: [[patterns-local-type-duplication]], [[project-stack]]
