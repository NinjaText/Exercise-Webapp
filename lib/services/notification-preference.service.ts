import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_REGISTRY } from "@/lib/notifications/registry";
import type { NotificationType } from "@/lib/notifications/types";

export interface PreferenceValues {
  emailEnabled: boolean;
  sessions: boolean;
  messages: boolean;
  nutrition: boolean;
  billing: boolean;
}

/** What a user with no stored row gets: everything on. */
export const PREFERENCE_DEFAULTS: PreferenceValues = {
  emailEnabled: true,
  sessions: true,
  messages: true,
  nutrition: true,
  billing: true,
};

/** `billing` is omitted — it is transactional and has no working toggle. */
export type PreferencePatch = Partial<Omit<PreferenceValues, "billing">>;

const EDITABLE_KEYS = ["emailEnabled", "sessions", "messages", "nutrition"] as const;

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function toValues(row: PreferenceValues): PreferenceValues {
  return {
    emailEnabled: row.emailEnabled,
    sessions: row.sessions,
    messages: row.messages,
    nutrition: row.nutrition,
    billing: row.billing,
  };
}

/**
 * The user's preferences, or the defaults when they have never saved any.
 * Reads only — never creates a row, so this is safe on every email send.
 *
 * Propagates a lookup failure. Use this anywhere "no row" and "we could not
 * find out" must be told apart — notably the settings screen, where rendering
 * a read failure as all-off toggles would let one save turn a transient blip
 * into a permanent, silent, self-inflicted mute.
 */
export async function readPreference(userId: string): Promise<PreferenceValues> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  return row ? toValues(row) : { ...PREFERENCE_DEFAULTS };
}

/**
 * The dispatcher's accessor: `readPreference`, but fails closed.
 *
 * If the lookup errors we return everything off, because emailing on an
 * unknown preference is worse than not emailing. That is the right answer for
 * `notifyUser` and the wrong answer for anything that shows the values back to
 * the user, which is what `readPreference` is for.
 */
export async function getPreference(userId: string): Promise<PreferenceValues> {
  try {
    return await readPreference(userId);
  } catch (err) {
    console.error(`[notification-preference] lookup failed for ${userId}:`, err);
    return { emailEnabled: false, sessions: false, messages: false, nutrition: false, billing: false };
  }
}

/**
 * Same as `getPreference`, but guarantees an `unsubToken` by creating the row
 * if it is missing. Used only for non-transactional mail, which needs an
 * unsubscribe link.
 *
 * The find-then-create is racy on purpose-built concurrency: the nutrition
 * nudge cron dispatches up to three `notifyUser` calls for the same user in
 * parallel, so all three can miss and all three can create. `userId @unique`
 * makes the losers fail, so a lost create is resolved by re-reading the row
 * the winner wrote rather than by dropping the email.
 */
export async function getOrCreatePreference(
  userId: string
): Promise<PreferenceValues & { unsubToken: string }> {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return { ...toValues(existing), unsubToken: existing.unsubToken };

  try {
    const created = await prisma.notificationPreference.create({
      data: { userId, ...PREFERENCE_DEFAULTS, unsubToken: newToken() },
    });
    return { ...toValues(created), unsubToken: created.unsubToken };
  } catch {
    // Lost the race (or the create failed for another reason). Re-read: if a
    // concurrent caller won, its row is now there. If nothing is there, the
    // throw propagates to `notifyUser`, which is the pre-existing behaviour.
    const row = await prisma.notificationPreference.findUniqueOrThrow({ where: { userId } });
    return { ...toValues(row), unsubToken: row.unsubToken };
  }
}

/**
 * Whether this type may be emailed, given these preferences. Pure.
 *
 * Category names double as the boolean field names on the model, which is what
 * makes `prefs[entry.category]` work.
 */
export function isAllowedByPrefs(prefs: PreferenceValues, type: NotificationType): boolean {
  const entry = NOTIFICATION_REGISTRY[type];
  if (!entry) return false;
  if (entry.transactional) return true;
  if (!prefs.emailEnabled) return false;
  return prefs[entry.category];
}

export async function isEmailAllowed(userId: string, type: NotificationType): Promise<boolean> {
  return isAllowedByPrefs(await getPreference(userId), type);
}

/**
 * Applies a patch, creating the row if needed. Any `billing` key is dropped:
 * billing mail is transactional, and accepting the field would imply a control
 * that does not exist.
 */
export async function updatePreference(userId: string, patch: PreferencePatch): Promise<void> {
  const clean: PreferencePatch = {};
  for (const key of EDITABLE_KEYS) {
    if (typeof patch[key] === "boolean") clean[key] = patch[key];
  }
  if (Object.keys(clean).length === 0) return;

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...PREFERENCE_DEFAULTS, ...clean, unsubToken: newToken() },
    update: clean,
  });
}

/** Resolves an unsubscribe token to its owner. Null for anything unrecognised. */
export async function resolveUnsubToken(token: string): Promise<{ userId: string } | null> {
  if (!token) return null;
  try {
    const row = await prisma.notificationPreference.findUnique({ where: { unsubToken: token } });
    return row ? { userId: row.userId } : null;
  } catch (err) {
    console.error("[notification-preference] token lookup failed:", err);
    return null;
  }
}
