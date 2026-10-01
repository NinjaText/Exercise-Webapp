/** The admin club page lists at most this many members (newest first). */
export const CLUB_MEMBER_LIST_LIMIT = 200;

/** Shown under the Members heading when the list was cut off at the limit. */
export function memberListTruncationNote(shown: number, limit = CLUB_MEMBER_LIST_LIMIT): string | undefined {
  return shown >= limit ? `Showing the first ${limit} members` : undefined;
}
