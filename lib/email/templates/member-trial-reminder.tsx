import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";
import type { ReminderKey } from "@/lib/clubs/trial-reminders";

interface Props extends Partial<EmailBrandProps> {
  recipientName: string;
  clubName: string;
  reminder: ReminderKey;
  billingLink: string;
}

const COPY: Record<ReminderKey, { title: string; intro: (club: string) => string }> = {
  d3: { title: "3 days left in your free trial", intro: (c) => `Your free ${c} trial ends in 3 days. Subscribe now to keep your programs and progress.` },
  d1: { title: "Your free trial ends tomorrow", intro: (c) => `Your free ${c} trial ends tomorrow. Subscribe to keep training without interruption.` },
  d0: { title: "Your free trial has ended", intro: (c) => `Your free ${c} trial has ended. Subscribe any time to pick up right where you left off.` },
};

export function MemberTrialReminderEmail({ recipientName, clubName, reminder, billingLink, ...brand }: Props) {
  const copy = COPY[reminder];
  return (
    <EmailLayout
      {...brand}
      title={copy.title}
      greeting={`Hi ${recipientName},`}
      intro={copy.intro(clubName)}
      cta={{ label: "Subscribe", href: billingLink }}
      reason="You're receiving this because you started a free trial."
    />
  );
}
