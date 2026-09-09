/**
 * Canonical "what do we call this person" rule used across the app: prefer
 * their real name, but a client invited by email often has no name on file
 * yet, so fall back to their email rather than showing blank text or a raw
 * database id.
 */
export function getDisplayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
  if (name) return name;
  return person.email ?? "Unknown";
}

/** Two-letter avatar initials, falling back to the email's first letter. */
export function getInitials(person: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const first = person.firstName?.[0] ?? "";
  const last = person.lastName?.[0] ?? "";
  const initials = `${first}${last}`.toUpperCase();
  if (initials) return initials;
  return (person.email?.[0] ?? "?").toUpperCase();
}
