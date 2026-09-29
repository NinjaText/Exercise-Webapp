import * as React from "react";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { getEmailBranding } from "@/lib/email/branding";
import { appBaseUrl } from "@/lib/utils/app-url";
import { dueReminder } from "@/lib/clubs/trial-reminders";
import { MemberTrialReminderEmail } from "@/lib/email/templates/member-trial-reminder";

const SUBJECTS = {
  d3: "3 days left in your free trial",
  d1: "Your free trial ends tomorrow",
  d0: "Your free trial has ended",
} as const;

/**
 * Daily cron body. Candidates are still-TRIALING members whose trial ends
 * within 3 days or ended within the last 7. A key is only recorded after a
 * successful send, so a Resend hiccup is retried on the next run instead of
 * silently dropped.
 */
export async function sendDueTrialReminders(now = new Date()) {
  const subs = await prisma.memberSubscription.findMany({
    where: {
      status: "TRIALING",
      // Already subscribed during the trial: nothing to remind them about.
      stripeSubscriptionId: null,
      trialEndsAt: {
        lte: new Date(now.getTime() + 72 * 3600_000),
        gte: new Date(now.getTime() - 7 * 24 * 3600_000),
      },
    },
    include: { user: { select: { email: true, firstName: true, isActive: true } } },
  });

  let sent = 0;
  for (const sub of subs) {
    if (!sub.user.isActive) continue;
    const key = dueReminder(sub.trialEndsAt, sub.remindersSent, now);
    if (!key) continue;
    try {
      const brand = await getEmailBranding(sub.clerkOrgId);
      const ok = await sendEmail({
        to: sub.user.email,
        subject: SUBJECTS[key],
        fromName: brand.fromName,
        replyTo: brand.replyTo,
        react: React.createElement(MemberTrialReminderEmail, {
          recipientName: sub.user.firstName || "there",
          clubName: brand.organizationName,
          reminder: key,
          billingLink: `${appBaseUrl()}/billing`,
          organizationName: brand.organizationName,
          accent: brand.accent,
          logoUrl: brand.logoUrl,
        }),
      });
      if (!ok) continue;
      await prisma.memberSubscription.update({ where: { id: sub.id }, data: { remindersSent: { push: key } } });
      sent += 1;
    } catch (error) {
      console.error(`Trial reminder failed for subscription ${sub.id}:`, error);
    }
  }
  return { checked: subs.length, sent };
}
