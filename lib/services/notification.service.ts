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
} from "@/lib/services/notification-preference.service";
import { getClubAlertRecipients } from "@/lib/services/club-alerts.service";

// Re-exported so existing importers of this module keep working unchanged.
export { NOTIFICATION_TYPES };
export type { NotificationType };

/**
 * The only types a house coach's mail fans out to the super admins for, mapped
 * to the template prop holding the CTA link (re-pointed at the club's admin
 * page). Every other house-coach notification stays in-app only.
 */
const ADMIN_ALERT_LINK_PROP: Partial<Record<NotificationType, string>> = {
  [NOTIFICATION_TYPES.NEW_MESSAGE]: "messagesLink",
  [NOTIFICATION_TYPES.NEW_RESPONSE]: "responseLink",
  [NOTIFICATION_TYPES.VOICE_MEMO]: "sessionLink",
  [NOTIFICATION_TYPES.COACHING_REQUESTED]: "clientLink",
};

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
 * Creates an in-app notification and, if the registry and the user's
 * preferences allow it, sends the matching email.
 *
 * Never throws. Both the notification write (step 1) and the email step
 * (registry, preferences, cooldown, rendering, and sending — `sendEmail` is
 * itself non-throwing) are guarded by the same try/catch. Every call site
 * invokes `notifyUser` after its real work has already committed, so letting
 * a write failure propagate would turn an already-successful operation into
 * a false-negative error — the caller retries and duplicates the underlying
 * write. A notification write failure is therefore logged loudly (with the
 * notification type and userId, tagged distinctly from the email-step log)
 * and swallowed, same as an email failure: a lost notification is the
 * lesser harm.
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  let step: "notification write" | "email step" = "notification write";
  try {
    // 1. The in-app notification, always and first.
    const created = await createNotification(input);
    step = "email step";

    // 2. Registry.
    const entry = NOTIFICATION_REGISTRY[input.type];
    if (!entry) {
      console.error(`[notify] no registry entry for type "${input.type}"`);
      return;
    }
    if (!entry.template) return;

    // A club's house coach is a shared account whose address is a placeholder:
    // its mail fans out to the super admins instead (see below).
    const houseCoachOrg = await prisma.organization.findFirst({
      where: { houseCoachUserId: input.userId },
      select: { clerkOrgId: true, name: true, brandDisplayName: true },
    }).catch((err) => {
      console.error(`[notify] house coach lookup failed for user ${input.userId}:`, err);
      return null;
    });

    const adminLinkProp = ADMIN_ALERT_LINK_PROP[input.type];
    if (houseCoachOrg && !adminLinkProp) return;

    // 3. Preferences. Transactional mail needs no unsubscribe token, so it
    //    reads without ever creating a row.
    let unsubscribeUrl: string | undefined;
    if (houseCoachOrg) {
      // Admins mute from /admin/clubs; the house coach has no preferences.
    } else if (entry.transactional) {
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

    // House coach: same template to every unmuted admin, never to the coach.
    if (houseCoachOrg && adminLinkProp) {
      const recipients = (await getClubAlertRecipients()).filter((r) => r.userId !== input.userId);
      if (recipients.length === 0) return;
      const admins = await prisma.user.findMany({
        where: { id: { in: recipients.map((r) => r.userId) } },
        select: { id: true, firstName: true, lastName: true },
      });
      const nameById = new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
      const prefix = `[${houseCoachOrg.brandDisplayName ?? houseCoachOrg.name}] `;
      const clubLink = `${appBaseUrl()}/admin/clubs/${houseCoachOrg.clerkOrgId}`;
      const template = entry.template;
      // One admin's failed send must not stop the rest.
      const results = await Promise.allSettled(
        recipients.map(async (r) => {
          const data: Record<string, unknown> = {
            ...input.email,
            [adminLinkProp]: clubLink,
            recipientName: nameById.get(r.userId) ?? "",
          };
          return sendEmail({
            to: r.email,
            subject: prefix + entry.subject(data),
            react: React.createElement(template, data),
          });
        })
      );
      for (const res of results) {
        if (res.status === "rejected") console.error(`[notify] admin alert send failed for ${input.type}:`, res.reason);
      }
      return;
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
  } catch (err) {
    console.error(`[notify] ${step} failed for ${input.type} / user ${input.userId}:`, err);
  }
}
