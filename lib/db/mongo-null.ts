/**
 * Prisma on MongoDB: a `{ field: null }` filter matches only documents where
 * the field is PRESENT and null — not documents where it was never written.
 * Optional fields omitted on create, or docs written before a field existed,
 * are absent, so a plain null filter silently skips them. Spread this into a
 * `where` (or into an `OR`/`AND` element) to match both cases.
 *
 * Writes should still store explicit nulls; this keeps reads correct for
 * legacy docs (see lib/db/scripts/backfill-club-null-fields.ts).
 */
export function nullOrUnset<F extends string>(field: F): { OR: Array<Record<F, null | { isSet: false }>> } {
  return {
    OR: [{ [field]: null } as Record<F, null>, { [field]: { isSet: false } } as Record<F, { isSet: false }>],
  };
}
