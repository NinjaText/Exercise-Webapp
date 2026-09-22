import * as React from "react";
import { EmailLayout } from "./layout";

interface CheckInAssignedEmailProps {
  recipientName: string;
  templateName: string;
  dueDate: string;
  checkInLink: string;
  unsubscribeUrl?: string;
}

export function CheckInAssignedEmail({
  recipientName,
  templateName,
  dueDate,
  checkInLink,
  unsubscribeUrl,
}: CheckInAssignedEmailProps) {
  return (
    <EmailLayout
      title="New check-in"
      accent="#2563eb"
      greeting={`Hi ${recipientName},`}
      intro="Your trainer has assigned you a new check-in."
      details={[
        { label: "Check-in", value: templateName },
        { label: "Due", value: dueDate },
      ]}
      cta={{ label: "Complete Check-In", href: checkInLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
