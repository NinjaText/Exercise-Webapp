import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface CoachingAcceptedEmailProps {
  recipientName: string;
  trainerName: string;
  clubName: string;
  dashboardLink: string;
  unsubscribeUrl?: string;
  /** Club branding — set by the dispatcher for a CLIENT recipient. */
  brand?: EmailBrandProps;
}

/** To the member: the trainer accepted; payment starts coaching. */
export function CoachingAcceptedEmail({
  brand,
  recipientName,
  trainerName,
  clubName,
  dashboardLink,
  unsubscribeUrl,
}: CoachingAcceptedEmailProps) {
  return (
    <EmailLayout
      title="Coaching request accepted"
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
      greeting={`Hi ${recipientName},`}
      intro={`${trainerName} accepted your coaching request at ${clubName}. Start your coaching subscription from your dashboard to begin.`}
      cta={{ label: "Start Coaching", href: dashboardLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
