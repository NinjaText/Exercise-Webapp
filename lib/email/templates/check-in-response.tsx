import * as React from "react";
import { EmailLayout } from "./layout";

interface CheckInResponseEmailProps {
  recipientName: string;
  clientName: string;
  templateName: string;
  submittedAt: string;
  responseLink: string;
  unsubscribeUrl?: string;
}

export function CheckInResponseEmail({
  recipientName,
  clientName,
  templateName,
  submittedAt,
  responseLink,
  unsubscribeUrl,
}: CheckInResponseEmailProps) {
  return (
    <EmailLayout
      title="Check-in submitted"
      accent="#16a34a"
      greeting={`Hi ${recipientName},`}
      intro={`${clientName} submitted a check-in.`}
      details={[
        { label: "Client", value: clientName },
        { label: "Check-in", value: templateName },
        { label: "Submitted", value: submittedAt },
      ]}
      cta={{ label: "Review Response", href: responseLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
