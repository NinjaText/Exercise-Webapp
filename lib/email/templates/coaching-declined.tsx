import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface CoachingDeclinedEmailProps {
  recipientName: string;
  trainerName: string;
  clubName: string;
  /** The trainer's optional reply. */
  note?: string;
  dashboardLink: string;
  unsubscribeUrl?: string;
  /** Club branding — set by the dispatcher for a CLIENT recipient. */
  brand?: EmailBrandProps;
}

/** To the member: the trainer declined. They may request again later. */
export function CoachingDeclinedEmail({
  brand,
  recipientName,
  trainerName,
  clubName,
  note,
  dashboardLink,
  unsubscribeUrl,
}: CoachingDeclinedEmailProps) {
  return (
    <EmailLayout
      title="Coaching request update"
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
      greeting={`Hi ${recipientName},`}
      intro={`${trainerName} isn't able to take on your coaching request at ${clubName} right now. You can keep training with your program and request coaching again later.`}
      quote={note || undefined}
      cta={{ label: "Go to Dashboard", href: dashboardLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
