import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";
import * as React from "react";
import { sendEmail } from "@/lib/email/send";
import {
  getClientEmailBranding,
  templateBrand,
  type EmailBranding,
} from "@/lib/email/branding";
import { appBaseUrl } from "@/lib/utils/app-url";
import { NOTIFICATION_REGISTRY } from "@/lib/notifications/registry";
import {
  getPreference,
  getOrCreatePreference,
  isAllowedByPrefs,
  isPushAllowed,
} from "@/lib/services/notification-preference.service";
import { sendPushToUser } from "@/lib/services/push.service";

// Re-exported so existing importers of this module keep working unchanged.
export { NOTIFICATION_TYPES };
export type { NotificationType };

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  // Typed as Prisma's InputJsonValue so callers can pass plain objects
  metadata?: Prisma.InputJsonValue;
}

/**
 * Fetches the most recent notifications for a user, sorted newest first.
 */
export async function getNotificationsForUser(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Returns the count of unread notifications for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Marks a single notification as read. Validates ownership before updating
 * to prevent users from marking other users' notifications read.
 */
export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

/**
 * Marks all of a user's notifications as read in a single bulk operation.
 */
export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/**
 * Creates a new notification for a user.
 */
export async function createNotification(data: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link,
      metadata: data.metadata,
    },
  });
}

export interface NotifyUserInput extends Omit<CreateNotificationInput, "type"> {
  type: NotificationType;
  /** Extra props for the template, merged under `recipientName`/`unsubscribeUrl`. */
  email?: Record<string, unknown>;
  /** Supply to skip the User lookup when the caller already has the address. */
  recipientEmail?: string;
  recipientName?: string;
}

/**
 * Creates an in-app notification, then, in parallel:
 * (a) sends a push notification mirroring it, if the registry and the
 *     user's push preference allow it, and
 * (b) if the registry and the user's email preferences allow it, sends the
 *     matching email.
 *
 * Never throws. The notification write (step 1) and the email step
 * (registry, preferences, cooldown, rendering, and sending — `sendEmail` is
 * itself non-throwing) are guarded by the same try/catch, as before. Push is
 * independent of email: it is kicked off as soon as the notification write
 * succeeds, runs concurrently with the email step below (not before or
 * after it), is guarded by its own try/catch so it can never surface as an
 * "email step" failure or vice versa, and ignores the email registry
 * template and cooldown entirely — it mirrors the in-app notification, not
 * the email, so it still fires for in-app-only types (no template) and
 * while the email is being suppressed by its cooldown. `notifyUser` awaits
 * the push promise in a `finally` around the email section, so it settles
 * before this function returns no matter which of the email section's early
 * returns (or its own throw) is taken.
 *
 * Every call site invokes `notifyUser` after its real work has already
 * committed, so letting a write failure propagate would turn an
 * already-successful operation into a false-negative error — the caller
 * retries and duplicates the underlying write. A notification write failure
 * is therefore logged loudly (with the notification type and userId, tagged
 * distinctly from the email-step log) and swallowed, same as an email
 * failure: a lost notification is the lesser harm. If the notification
 * write itself fails, no push is sent — there is no notification left to
 * mirror.
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  let step: "notification write" | "email step" = "notification write";
  try {
    // 1. The in-app notification, always and first.
    const created = await createNotification(input);
    step = "email step";

    // Push: independent of email, started now so it runs concurrently with
    // the email step below. Self-contained — never throws or rejects.
    const pushDone: Promise<void> = (async () => {
      try {
        if (isPushAllowed(await getPreference(input.userId), input.type)) {
          await sendPushToUser(input.userId, {
            title: input.title,
            body: input.body ?? undefined,
            link: input.link ?? undefined,
          });
        }
      } catch (err) {
        console.error(`[notify] push step failed for ${input.type} / user ${input.userId}:`, err);
      }
    })();

    try {
      // 2. Registry.
      const entry = NOTIFICATION_REGISTRY[input.type];
      if (!entry) {
        console.error(`[notify] no registry entry for type "${input.type}"`);
        return;
      }
      if (!entry.template) return;

      // 3. Preferences. Transactional mail needs no unsubscribe token, so it
      //    reads without ever creating a row.
      let unsubscribeUrl: string | undefined;
      if (entry.transactional) {
        if (!isAllowedByPrefs(await getPreference(input.userId), input.type)) return;
      } else {
        const prefs = await getOrCreatePreference(input.userId);
        if (!isAllowedByPrefs(prefs, input.type)) return;
        unsubscribeUrl =
          `${appBaseUrl()}/api/notifications/unsubscribe` +
          `?token=${prefs.unsubToken}&category=${entry.category}`;
      }

      // 4. Cooldown, excluding the row created in step 1.
      if (entry.cooldownMinutes !== null) {
        const since = new Date(Date.now() - entry.cooldownMinutes * 60_000);
        const recent = await prisma.notification.findFirst({
          where: {
            userId: input.userId,
            type: input.type,
            id: { not: created.id },
            createdAt: { gte: since },
          },
          select: { id: true },
        });
        if (recent) return;
      }

      // 5. Recipient.
      let to = input.recipientEmail;
      let recipientName = input.recipientName;
      if (!to || !recipientName) {
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (!user?.email) {
          console.error(`[notify] no email address for user ${input.userId}`);
          return;
        }
        to = to ?? user.email;
        recipientName = recipientName ?? `${user.firstName} ${user.lastName}`.trim();
      }

      // 6. Org branding — only for mail a CLIENT receives (spec §7). Billing
      //    and trainer-recipient mail stays product-branded. A failed lookup
      //    must never block the email, so it degrades to "unbranded".
      let branding: EmailBranding | null = null;
      if (entry.clientFacing && !entry.transactional) {
        branding = await getClientEmailBranding(input.userId).catch((err) => {
          console.error(`[notify] branding lookup failed for user ${input.userId}:`, err);
          return null;
        });
      }

      // 7. Render and send.
      const data: Record<string, unknown> = {
        ...input.email,
        recipientName,
        unsubscribeUrl,
        ...(branding ? { brand: templateBrand(branding) } : {}),
      };
      await sendEmail({
        to,
        subject: entry.subject(data),
        react: React.createElement(entry.template, data),
        // Undefined for transactional types, which carry no unsubscribe link —
        // so billing mail correctly ships without the one-click headers.
        unsubscribeUrl,
        // An unbranded org (enabled: false) sends exactly as before branding.
        ...(branding?.enabled ? { fromName: branding.fromName, replyTo: branding.replyTo } : {}),
      });
    } finally {
      // Push runs concurrently with the email section above; wait for it
      // here so it has settled before notifyUser returns, on every path
      // out of that section (its early returns, a normal finish, or it
      // throwing through to the outer catch below).
      await pushDone;
    }
  } catch (err) {
    console.error(`[notify] ${step} failed for ${input.type} / user ${input.userId}:`, err);
  }
}
