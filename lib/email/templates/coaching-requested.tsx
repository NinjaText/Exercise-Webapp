import * as React from "react";
import { EmailLayout } from "./layout";

interface CoachingRequestedEmailProps {
  recipientName: string;
  memberName: string;
  note: string;
  clientLink: string;
  unsubscribeUrl?: string;
}

/** To the house coach: a member asked for the paid coaching add-on. */
export function CoachingRequestedEmail({
  recipientName,
  memberName,
  note,
  clientLink,
  unsubscribeUrl,
}: CoachingRequestedEmailProps) {
  return (
    <EmailLayout
      title="Coaching request"
      greeting={`Hi ${recipientName},`}
      intro={`${memberName} asked you for personal coaching. Review their note and accept or decline the request.`}
      quote={note}
      cta={{ label: "Review Request", href: clientLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
