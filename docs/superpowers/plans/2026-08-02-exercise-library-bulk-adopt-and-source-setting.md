# Exercise Library Bulk-Adopt & Program Exercise-Source Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trainer select multiple universal exercises and add them all to their organization in one action, and let an organization set a default exercise-source preference (Universal / My Organization / Both) that controls which tab(s) the program-builder's exercise picker shows.

**Architecture:** No schema or backend changes for bulk-adopt — `adoptUniversalExercisesAction` already exists, fully implemented; this is UI-only work reusing the existing `Set<string>`-based bulk-select pattern from `components/admin/exercises-table.tsx`. The exercise-source preference is a new field on the existing `OrganizationMetadata` (stored in Clerk `publicMetadata`, no new Prisma model), threaded through the exact prop-passing chain that already carries `organizationOrganizationId` from program pages down to the exercise picker. A new pure helper, `resolvePickerTabs`, is the single source of truth for which tab(s) the picker shows given the preference and whether the trainer has an org.

**Tech Stack:** Next.js App Router (TypeScript) Server Actions, Clerk `publicMetadata` (org settings, no Prisma model), Vitest for tests (node environment — no React component test harness in this repo, so UI-only behavior is verified by manual QA, not automated component tests).

## Global Constraints

- No new Prisma models or migrations.
- No confirm dialog for bulk-adopt (it's non-destructive, unlike the admin table's bulk-delete which this UI pattern is borrowed from).
- Existing orgs must see zero behavior change until they explicitly set the new preference — default to `"BOTH"` everywhere it's read.
- The exercise-source preference affects **only** the program-builder's exercise picker (`ExercisePickerDialog`) — the main `/exercises` library page's tab visibility is unaffected.
- The "Create New" exercise flow inside the picker stays available regardless of the preference value.
- Follow the existing test-mocking conventions already used in `actions/__tests__/organization-actions.test.ts` (mock `@clerk/nextjs/server`, `@/lib/prisma`, `next/cache`, `@/lib/services/audit-log.service`).

---

### Task 1: `resolvePickerTabs` helper

**Files:**
- Create: `lib/utils/exercise-picker.ts`
- Test: `lib/utils/__tests__/exercise-picker.test.ts`

**Interfaces:**
- Produces: `EXERCISE_SOURCE_PREFERENCES` (const array), `ExerciseSourcePreference` (type), `PickerTabVisibility` (type), `resolvePickerTabs(preference, hasOrg): PickerTabVisibility` — consumed by Task 2 (`OrganizationMetadata`'s field type) and Task 4 (`ExercisePickerDialog`).

- [ ] **Step 1: Write the failing test**

Create `lib/utils/__tests__/exercise-picker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolvePickerTabs } from '../exercise-picker'

describe('resolvePickerTabs', () => {
  it('shows Universal only when the trainer has no organization, regardless of preference', () => {
    expect(resolvePickerTabs('BOTH', false)).toEqual({ showUniversal: true, showOrganization: false })
    expect(resolvePickerTabs('ORGANIZATION', false)).toEqual({ showUniversal: true, showOrganization: false })
    expect(resolvePickerTabs(undefined, false)).toEqual({ showUniversal: true, showOrganization: false })
  })

  it('shows both tabs when preference is BOTH and the trainer has an organization', () => {
    expect(resolvePickerTabs('BOTH', true)).toEqual({ showUniversal: true, showOrganization: true })
  })

  it('defaults to BOTH (both tabs) when preference is undefined and the trainer has an organization', () => {
    expect(resolvePickerTabs(undefined, true)).toEqual({ showUniversal: true, showOrganization: true })
  })

  it('shows Universal only when preference is UNIVERSAL', () => {
    expect(resolvePickerTabs('UNIVERSAL', true)).toEqual({ showUniversal: true, showOrganization: false })
  })

  it('shows My Organization only when preference is ORGANIZATION', () => {
    expect(resolvePickerTabs('ORGANIZATION', true)).toEqual({ showUniversal: false, showOrganization: true })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/utils/__tests__/exercise-picker.test.ts`
Expected: FAIL — cannot find module `../exercise-picker` (file doesn't exist yet).

- [ ] **Step 3: Implement `resolvePickerTabs`**

Create `lib/utils/exercise-picker.ts`:

```ts
export const EXERCISE_SOURCE_PREFERENCES = ["UNIVERSAL", "ORGANIZATION", "BOTH"] as const;

export type ExerciseSourcePreference = (typeof EXERCISE_SOURCE_PREFERENCES)[number];

export interface PickerTabVisibility {
  showUniversal: boolean;
  showOrganization: boolean;
}

/**
 * Decides which tab(s) the program-builder's exercise picker should show,
 * given the organization's exercise-source preference and whether the
 * trainer belongs to an organization at all. A trainer with no organization
 * always sees Universal only, regardless of a stale/irrelevant preference.
 */
export function resolvePickerTabs(
  preference: ExerciseSourcePreference | undefined,
  hasOrg: boolean
): PickerTabVisibility {
  if (!hasOrg) return { showUniversal: true, showOrganization: false };

  switch (preference ?? "BOTH") {
    case "UNIVERSAL":
      return { showUniversal: true, showOrganization: false };
    case "ORGANIZATION":
      return { showUniversal: false, showOrganization: true };
    default:
      return { showUniversal: true, showOrganization: true };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/utils/__tests__/exercise-picker.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/exercise-picker.ts lib/utils/__tests__/exercise-picker.test.ts
git commit -m "feat(exercises): add resolvePickerTabs helper for exercise-source preference"
```

---

### Task 2: Exercise-source preference — backend

**Files:**
- Modify: `actions/organization-actions.ts`
- Test: `actions/__tests__/organization-actions.test.ts`

**Interfaces:**
- Consumes: `EXERCISE_SOURCE_PREFERENCES`, `ExerciseSourcePreference` (Task 1).
- Produces: `OrganizationMetadata.exerciseSourcePreference?: ExerciseSourcePreference` (new field, defaults to `"BOTH"` on read) — consumed by Task 3 (settings form) and Task 4 (program pages).

- [ ] **Step 1: Write the failing tests**

In `actions/__tests__/organization-actions.test.ts`, change the import line to also bring in `getOrganizationProfile`:

```ts
import { getOrganizationProfile, saveOrganizationProfile } from '../organization-actions'
```

Add these tests after the existing two:

```ts
it('defaults exerciseSourcePreference to BOTH when not set in publicMetadata', async () => {
  mockGetOrganization.mockResolvedValue({ name: 'Old Name', publicMetadata: {} })
  const profile = await getOrganizationProfile()
  expect(profile?.exerciseSourcePreference).toBe('BOTH')
})

it('returns a stored valid exerciseSourcePreference as-is', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { exerciseSourcePreference: 'UNIVERSAL' },
  })
  const profile = await getOrganizationProfile()
  expect(profile?.exerciseSourcePreference).toBe('UNIVERSAL')
})

it('falls back to BOTH for a corrupted or unrecognized stored value', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { exerciseSourcePreference: 'GARBAGE' },
  })
  const profile = await getOrganizationProfile()
  expect(profile?.exerciseSourcePreference).toBe('BOTH')
})

it('saves exerciseSourcePreference and includes it in the audit diff', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { tagline: 'Old tagline', exerciseSourcePreference: 'BOTH' },
  })
  const result = await saveOrganizationProfile({
    organizationName: 'New Name',
    tagline: 'Old tagline',
    exerciseSourcePreference: 'ORGANIZATION',
  })
  expect(result.success).toBe(true)
  expect(mockUpdateOrganization).toHaveBeenCalledWith('org_1', expect.objectContaining({
    publicMetadata: expect.objectContaining({ exerciseSourcePreference: 'ORGANIZATION' }),
  }))
  expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      after: expect.objectContaining({ exerciseSourcePreference: 'ORGANIZATION' }),
    }),
  }))
})

it('rejects an invalid exerciseSourcePreference by falling back to BOTH rather than storing garbage', async () => {
  mockGetOrganization.mockResolvedValue({
    name: 'Old Name',
    publicMetadata: { tagline: 'Old tagline', exerciseSourcePreference: 'BOTH' },
  })
  const result = await saveOrganizationProfile({
    organizationName: 'New Name',
    tagline: 'Old tagline',
    exerciseSourcePreference: 'NOT_REAL' as never,
  })
  expect(result.success).toBe(true)
  expect(mockUpdateOrganization).toHaveBeenCalledWith('org_1', expect.objectContaining({
    publicMetadata: expect.objectContaining({ exerciseSourcePreference: 'BOTH' }),
  }))
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run actions/__tests__/organization-actions.test.ts`
Expected: FAIL — `exerciseSourcePreference` is `undefined` on the returned profile (no such field exists yet), and the "invalid preference" test's `updateOrganization` call won't contain the fallback-corrected value.

- [ ] **Step 3: Implement the field**

In `actions/organization-actions.ts`, add the import and extend `OrganizationMetadata`:

```ts
import { EXERCISE_SOURCE_PREFERENCES, type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";

export interface OrganizationMetadata {
  organizationName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  exerciseSourcePreference?: ExerciseSourcePreference;
}
```

Replace the body of `getOrganizationProfile` (keep the existing early returns for `!userId`/`!dbUser?.clerkOrgId` unchanged) with:

```ts
  const meta = (org.publicMetadata ?? {}) as Record<string, string>;
  const exerciseSourcePreference: ExerciseSourcePreference = EXERCISE_SOURCE_PREFERENCES.includes(
    meta.exerciseSourcePreference as ExerciseSourcePreference
  )
    ? (meta.exerciseSourcePreference as ExerciseSourcePreference)
    : "BOTH";

  return {
    organizationName: org.name,
    tagline: meta.tagline ?? "",
    logoUrl: meta.logoUrl ?? "",
    phone: meta.phone ?? "",
    email: meta.email ?? "",
    website: meta.website ?? "",
    address: meta.address ?? "",
    exerciseSourcePreference,
  };
```

In `saveOrganizationProfile`, replace the `normalizedAfter` construction and the `client.organizations.updateOrganization(...)` call with:

```ts
    const normalizedAfter: OrganizationMetadata = {
      organizationName: input.organizationName.trim(),
      tagline: input.tagline ?? "",
      logoUrl: input.logoUrl ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      website: input.website ?? "",
      address: input.address ?? "",
      exerciseSourcePreference: EXERCISE_SOURCE_PREFERENCES.includes(
        input.exerciseSourcePreference as ExerciseSourcePreference
      )
        ? (input.exerciseSourcePreference as ExerciseSourcePreference)
        : "BOTH",
    };

    await client.organizations.updateOrganization(dbUser.clerkOrgId, {
      name: normalizedAfter.organizationName,
      publicMetadata: {
        tagline: normalizedAfter.tagline,
        logoUrl: normalizedAfter.logoUrl,
        phone: normalizedAfter.phone,
        email: normalizedAfter.email,
        website: normalizedAfter.website,
        address: normalizedAfter.address,
        exerciseSourcePreference: normalizedAfter.exerciseSourcePreference,
      },
    });
```

And extend the `diffFields(...)` call's field-name array:

```ts
    const diff = before
      ? diffFields(
          before as unknown as Record<string, unknown>,
          normalizedAfter as unknown as Record<string, unknown>,
          ["organizationName", "tagline", "logoUrl", "phone", "email", "website", "address", "exerciseSourcePreference"]
        )
      : undefined;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run actions/__tests__/organization-actions.test.ts`
Expected: PASS (7 tests: the original 2 plus the 5 new ones)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add actions/organization-actions.ts actions/__tests__/organization-actions.test.ts
git commit -m "feat(organizations): add exerciseSourcePreference to organization metadata"
```

---

### Task 3: Settings UI for the exercise-source preference

**Files:**
- Modify: `components/settings/organization-profile-form.tsx`

**Interfaces:**
- Consumes: `ExerciseSourcePreference`, `EXERCISE_SOURCE_PREFERENCES` (Task 1), `OrganizationMetadata.exerciseSourcePreference` (Task 2).

No automated tests — this repo has no component test harness. Verify via manual QA in Step 3.

- [ ] **Step 1: Add the Select control**

In `components/settings/organization-profile-form.tsx`:

1. Add imports:

```ts
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
```

2. Add controlled state below the existing `logoUrl` state (this field needs controlled state like `logoUrl` does, since the underlying `Select` primitive has no native form/`FormData` integration):

```ts
  const [exerciseSourcePreference, setExerciseSourcePreference] = useState<ExerciseSourcePreference>(
    initialData?.exerciseSourcePreference ?? "BOTH"
  );
```

3. In `handleSubmit`, add the field to the `saveOrganizationProfile` call:

```ts
    const result = await saveOrganizationProfile({
      organizationName: formData.get("organizationName") as string,
      tagline: (formData.get("tagline") as string) || undefined,
      logoUrl: logoUrl || undefined,
      phone: (formData.get("phone") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      website: (formData.get("website") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
      exerciseSourcePreference,
    });
```

4. Add the new field's UI block, after the existing "address" field's `<div className="space-y-2">...</div>` block and before the submit button's `<div className="flex justify-end">`:

```tsx
          <div className="space-y-2">
            <Label htmlFor="exerciseSourcePreference">Program Exercise Library</Label>
            <Select
              value={exerciseSourcePreference}
              onValueChange={(v) => setExerciseSourcePreference((v as ExerciseSourcePreference) ?? "BOTH")}
            >
              <SelectTrigger id="exerciseSourcePreference">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOTH">Universal + My Organization</SelectItem>
                <SelectItem value="UNIVERSAL">Universal exercises only</SelectItem>
                <SelectItem value="ORGANIZATION">My Organization exercises only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Controls which exercises trainers see by default when building a program.
            </p>
          </div>
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, no regressions (this task has no new automated tests).

- [ ] **Step 3: Manual QA**

Run `npm run dev`, sign in as a trainer belonging to an organization, go to Settings → Organization Profile:
- Confirm the "Program Exercise Library" select shows "Universal + My Organization" by default (for an org that never set this before).
- Change it to "My Organization exercises only", save, reload the page — confirm the select still shows "My Organization exercises only" (persisted correctly).
- Change it to "Universal exercises only", save, reload — confirm it persists.
- Set it back to "Universal + My Organization" to leave the org in the default state for the rest of this plan's manual QA steps.

- [ ] **Step 4: Commit**

```bash
git add components/settings/organization-profile-form.tsx
git commit -m "feat(settings): add Program Exercise Library preference control"
```

---

### Task 4: Thread the preference through the program-builder's exercise picker

**Files:**
- Modify: `components/programs/exercise-picker-dialog.tsx`
- Modify: `components/programs/program-builder.tsx`
- Modify: `components/programs/program-editor.tsx`
- Modify: `app/(platform)/programs/new/page.tsx`
- Modify: `app/(platform)/programs/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `resolvePickerTabs`, `ExerciseSourcePreference` (Task 1), `getOrganizationProfile` (Task 2, already exists — reused, not modified further).
- Produces: `exerciseSourcePreference?: ExerciseSourcePreference` prop threaded through `ExercisePickerDialog` → `ProgramBuilder` → `ProgramEditor` → the two program pages.

No automated tests — this repo has no component test harness, and `resolvePickerTabs` itself is already unit-tested in Task 1. Verify via manual QA in Step 6.

- [ ] **Step 1: Add the prop and tab-visibility logic to `ExercisePickerDialog`**

In `components/programs/exercise-picker-dialog.tsx`:

1. Add the import:

```ts
import { resolvePickerTabs, type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";
```

2. Add the new field to `Props`:

```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  organizationOrganizationId?: string | null;
  exerciseSourcePreference?: ExerciseSourcePreference;
}
```

3. Add `exerciseSourcePreference` to the destructured function parameters — the signature currently reads:

```ts
export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
  organizationOrganizationId,
}: Props) {
```

change it to:

```ts
export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
  organizationOrganizationId,
  exerciseSourcePreference,
}: Props) {
```

4. Inside the component body (near where `universalExercises`/`myOrganizationExercises` are computed via `useMemo`, before the `return`), compute tab visibility:

```ts
  const { showUniversal, showOrganization } = resolvePickerTabs(
    exerciseSourcePreference,
    !!organizationOrganizationId
  );
```

5. Replace the render block that currently reads:

```tsx
              {organizationOrganizationId ? (
                <Tabs defaultValue="universal" className="flex flex-col flex-1 overflow-hidden">
                  <TabsList className="shrink-0 mx-4 mt-2 mb-1 h-8 text-xs">
                    <TabsTrigger value="universal" className="flex-1 text-xs h-6">Universal</TabsTrigger>
                    <TabsTrigger value="my-organization" className="flex-1 text-xs h-6">My Organization</TabsTrigger>
                  </TabsList>
                  <TabsContent value="universal" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredUniversal}
                      phase={phase}
                      setPhase={setPhase}
                      setRegion={setRegion}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                  <TabsContent value="my-organization" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredMyOrganization}
                      showOrganizationControls
                      phase={phase}
                      setPhase={setPhase}
                      setRegion={setRegion}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <ExerciseList
                  list={filteredUniversal}
                  phase={phase}
                  setPhase={setPhase}
                  setRegion={setRegion}
                  onSelect={onSelect}
                  onClose={handleClose}
                  onPreview={setVideoPreview}
                  onTogglePublic={handleTogglePublic}
                />
              )}
```

with:

```tsx
              {showUniversal && showOrganization ? (
                <Tabs defaultValue="universal" className="flex flex-col flex-1 overflow-hidden">
                  <TabsList className="shrink-0 mx-4 mt-2 mb-1 h-8 text-xs">
                    <TabsTrigger value="universal" className="flex-1 text-xs h-6">Universal</TabsTrigger>
                    <TabsTrigger value="my-organization" className="flex-1 text-xs h-6">My Organization</TabsTrigger>
                  </TabsList>
                  <TabsContent value="universal" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredUniversal}
                      phase={phase}
                      setPhase={setPhase}
                      setRegion={setRegion}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                  <TabsContent value="my-organization" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredMyOrganization}
                      showOrganizationControls
                      phase={phase}
                      setPhase={setPhase}
                      setRegion={setRegion}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                </Tabs>
              ) : showOrganization ? (
                <ExerciseList
                  list={filteredMyOrganization}
                  showOrganizationControls
                  phase={phase}
                  setPhase={setPhase}
                  setRegion={setRegion}
                  onSelect={onSelect}
                  onClose={handleClose}
                  onPreview={setVideoPreview}
                  onTogglePublic={handleTogglePublic}
                />
              ) : (
                <ExerciseList
                  list={filteredUniversal}
                  phase={phase}
                  setPhase={setPhase}
                  setRegion={setRegion}
                  onSelect={onSelect}
                  onClose={handleClose}
                  onPreview={setVideoPreview}
                  onTogglePublic={handleTogglePublic}
                />
              )}
```

Do **not** change the "Create New" button's condition (`{view === "list" && organizationOrganizationId && (...)}`) — it must stay gated only on `organizationOrganizationId`, independent of the preference, per the plan's scope.

- [ ] **Step 2: Thread the prop through `ProgramBuilder`**

In `components/programs/program-builder.tsx`:

1. Add the import: `import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";`
2. Add to `Props`: `exerciseSourcePreference?: ExerciseSourcePreference;` (alongside the existing `organizationOrganizationId?: string;`)
3. Add to the destructured function parameters: `export function ProgramBuilder({ workouts, onChange, exerciseLibrary, organizationOrganizationId, exerciseSourcePreference }: Props) {`
4. Add the prop to the `<ExercisePickerDialog ... />` call:

```tsx
      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        onSelect={addExerciseToBlock}
        organizationOrganizationId={organizationOrganizationId}
        exerciseSourcePreference={exerciseSourcePreference}
      />
```

- [ ] **Step 3: Thread the prop through `ProgramEditor`**

In `components/programs/program-editor.tsx`:

1. Add the import: `import { type ExerciseSourcePreference } from "@/lib/utils/exercise-picker";`
2. Add to `Props`: `exerciseSourcePreference?: ExerciseSourcePreference;`
3. Add to the destructured function parameters: `export function ProgramEditor({ program, exercises, onSave, redirectTo, organizationOrganizationId, clinics, exerciseSourcePreference }: Props) {`
4. Add the prop to the `<ProgramBuilder ... />` call:

```tsx
        <ProgramBuilder
          workouts={workouts}
          onChange={setWorkouts}
          exerciseLibrary={exercises}
          organizationOrganizationId={organizationOrganizationId}
          exerciseSourcePreference={exerciseSourcePreference}
        />
```

- [ ] **Step 4: Fetch and pass the preference from `app/(platform)/programs/new/page.tsx`**

Replace the file's contents with:

```tsx
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export default async function NewProgramPage() {
  const [user, { orgId: sessionOrgId }, exercises, organizationProfile] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
    getExercises(),
    getOrganizationProfile(),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <PageHeader
        title="Create Program"
        description="Build a new training program from scratch or start from a template."
      />
      <ProgramEditor
        exercises={exercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
      />
    </div>
  );
}
```

- [ ] **Step 5: Fetch and pass the preference from `app/(platform)/programs/[id]/edit/page.tsx`**

Replace the file's contents with:

```tsx
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { getExercises } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { ProgramEditor } from "@/components/programs/program-editor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProgramPage({ params }: Props) {
  const { id } = await params;

  const [user, { orgId: sessionOrgId }, program, exercises, organizationProfile] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
    programService.getProgramById(id),
    getExercises(),
    getOrganizationProfile(),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  if (!program || program.trainerId !== user.id) notFound();

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href={`/programs/${id}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Program
        </Link>
      </Button>
      <PageHeader title="Edit Program" description={`Modify “${program.name}”`} />
      <ProgramEditor
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
        organizationOrganizationId={organizationOrgId}
        exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
      />
    </div>
  );
}
```

Note: the `description` string uses curly quotes (`“…”`), not straight quotes — matching the current file exactly.

- [ ] **Step 6: Run the full test suite, then manual QA**

Run: `npm test`
Expected: all tests PASS, no regressions.

Run `npm run dev`, signed in as a trainer belonging to an organization:
- With the setting at "Universal + My Organization" (the default from Task 3's QA): open the exercise picker in `/programs/new` — confirm both tabs render as before.
- Change the setting to "My Organization exercises only", reload `/programs/new`, open the picker — confirm only the My Organization list renders (no tabs), and it shows the org's own exercises. Confirm "Create New" is still available.
- Change the setting to "Universal exercises only", reload, open the picker — confirm only the Universal list renders (no tabs), and "Create New" is still available.
- Set the setting back to "Universal + My Organization" when done.
- As a trainer with no organization (if you have such a test account) or by temporarily testing the no-org code path: confirm the picker still shows Universal-only regardless of any stored preference (the defensive fallback in `resolvePickerTabs`).

- [ ] **Step 7: Commit**

```bash
git add components/programs/exercise-picker-dialog.tsx components/programs/program-builder.tsx components/programs/program-editor.tsx "app/(platform)/programs/new/page.tsx" "app/(platform)/programs/[id]/edit/page.tsx"
git commit -m "feat(programs): respect organization exercise-source preference in the exercise picker"
```

---

### Task 5: Bulk-adopt UI in the exercise library

**Files:**
- Modify: `components/exercises/exercise-card.tsx`
- Modify: `components/exercises/exercise-grid.tsx`

**Interfaces:**
- Consumes: existing `adoptUniversalExercisesAction(exerciseIds: string[])` (unchanged).
- Produces: new optional `ExerciseCard` props `selectable?: boolean`, `selected?: boolean`, `onToggleSelect?: () => void`. `ExerciseGrid`'s external props are unchanged — selection state is fully internal to it.

No automated tests — this repo has no component test harness, and the backend action is already covered by existing tests. Verify via manual QA in Step 3.

- [ ] **Step 1: Add selection support to `ExerciseCard`**

In `components/exercises/exercise-card.tsx`:

1. Add the import: `import { Checkbox } from "@/components/ui/checkbox";`
2. Add to `ExerciseCardProps`:

```ts
interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhases?: string[];
  equipmentRequired: string[];
  description?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isActive?: boolean;
  isTrainer?: boolean;
  source?: string;
  isPublic?: boolean;
  organizationId?: string | null;
  organizationOrganizationId?: string | null;
  canAdopt?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}
```

3. Add the new props to the destructured function parameters:

```ts
export function ExerciseCard({
  id, name, bodyRegion, difficultyLevel, exercisePhases, equipmentRequired,
  description, imageUrl, videoUrl, isActive, isTrainer,
  source, isPublic: initialIsPublic, organizationId, organizationOrganizationId, canAdopt,
  selectable, selected, onToggleSelect,
}: ExerciseCardProps) {
```

4. Add `selected` to the `Card`'s className (find the existing `className={cn(...)}` on the `<Card>` element and add a new conditional class):

```tsx
    <Card className={cn(
      "group relative flex flex-col overflow-hidden border-0 shadow-sm ring-1 ring-border/50 transition-all duration-250 hover:-translate-y-1 hover:shadow-xl hover:ring-border/80",
      isActive === false && "opacity-60",
      selected && "ring-2 ring-primary"
    )}>
```

5. Add the checkbox overlay as the first child inside `<Card>`, immediately before the existing `<Link href={`/exercises/${id}`} ...>` element:

```tsx
      {selectable && (
        <div className="absolute left-2 top-2 z-20">
          <Checkbox
            checked={!!selected}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ${name}`}
            className="bg-background/90"
          />
        </div>
      )}
```

- [ ] **Step 2: Add selection state, Select-mode toggle, and the bulk-adopt bar to `ExerciseGrid`**

Replace the entire contents of `components/exercises/exercise-grid.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { adoptUniversalExercisesAction } from "@/actions/exercise-actions";
import type { getExercises } from "@/lib/services/exercise.service";

type ExerciseListItem = Awaited<ReturnType<typeof getExercises>>[number];

interface ExerciseGridProps {
  exercises: ExerciseListItem[];
  activeSource: "UNIVERSAL" | "ORGANIZATION";
  organizationOrgId?: string;
}

export function ExerciseGrid({ exercises, activeSource, organizationOrgId }: ExerciseGridProps) {
  const router = useRouter();
  const canAdopt = activeSource === "UNIVERSAL" && !!organizationOrgId;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdopting, startAdopting] = useTransition();

  const allSelected = exercises.length > 0 && exercises.every((ex) => selectedIds.has(ex.id));
  const someSelected = exercises.some((ex) => selectedIds.has(ex.id)) && !allSelected;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        exercises.forEach((ex) => next.delete(ex.id));
        return next;
      }
      const next = new Set(prev);
      exercises.forEach((ex) => next.add(ex.id));
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleBulkAdopt() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    startAdopting(async () => {
      const result = await adoptUniversalExercisesAction(ids);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { successCount, failures } = result;
      if (failures.length === 0) {
        toast.success(`Added ${successCount} exercise${successCount !== 1 ? "s" : ""} to your organization`);
      } else if (successCount > 0) {
        toast.warning(`Added ${successCount} of ${ids.length} — ${failures.length} could not be added`);
      } else {
        toast.error("Could not add the selected exercises");
      }

      exitSelectMode();
      if (successCount > 0) router.push("/exercises?source=ORGANIZATION");
    });
  }

  return (
    <div className="space-y-3">
      {canAdopt && (
        <div className="flex items-center justify-between">
          {selectMode ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all exercises on this page"
              />
              Select all on this page
            </label>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            id={exercise.id}
            name={exercise.name}
            bodyRegion={exercise.bodyRegion}
            difficultyLevel={exercise.difficultyLevel}
            exercisePhases={exercise.exercisePhases}
            equipmentRequired={exercise.equipmentRequired}
            description={exercise.description}
            imageUrl={exercise.imageUrl}
            videoUrl={exercise.videoUrl}
            isActive={exercise.isActive}
            isTrainer
            source={exercise.source}
            isPublic={exercise.isPublic}
            organizationId={exercise.organizationId}
            organizationOrganizationId={organizationOrgId}
            canAdopt={canAdopt}
            selectable={selectMode && canAdopt}
            selected={selectedIds.has(exercise.id)}
            onToggleSelect={() => toggleOne(exercise.id)}
          />
        ))}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" onClick={handleBulkAdopt} disabled={isAdopting}>
              {isAdopting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add to My Organization
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelectMode} disabled={isAdopting}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite, then manual QA**

Run: `npm test`
Expected: all tests PASS, no regressions.

Run `npm run dev`, signed in as a trainer belonging to an organization, go to `/exercises` (defaults to the Universal tab):
- Confirm a "Select" button appears. Click it — confirm checkboxes appear on every card and a "Select all on this page" checkbox appears.
- Select 2-3 exercises individually — confirm the floating bar appears showing the correct count.
- Click "Select all on this page" — confirm every visible card becomes checked and the bar's count updates; click it again — confirm all are deselected.
- With 2-3 exercises selected, click "Add to My Organization" — confirm a success toast, that you land on the My Organization tab (`?source=ORGANIZATION`), and that the adopted exercises appear there.
- Repeat, but include one exercise that's already been adopted (so it's no longer strictly "universal-only" from the backend's perspective) or otherwise engineer a partial failure if feasible — confirm the partial-failure toast wording. If a partial failure isn't easily reproducible, skip this specific check and note it.
- Click "Select" again, select nothing, click "Cancel" — confirm it exits select mode cleanly with no error.
- Switch to the My Organization tab — confirm no "Select" button appears there (bulk-adopt is Universal-tab-only) and the existing single-exercise "Add to My Organization" button still works on individual Universal-tab cards when not in select mode.

- [ ] **Step 4: Commit**

```bash
git add components/exercises/exercise-card.tsx components/exercises/exercise-grid.tsx
git commit -m "feat(exercises): add bulk-select and bulk-adopt to the Universal tab"
```
