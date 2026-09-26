import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface CheckInAssignedEmailProps {
  recipientName: string;
  templateName: string;
  dueDate: string;
  checkInLink: string;
  unsubscribeUrl?: string;
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps;
}

export function CheckInAssignedEmail({
  brand,
  recipientName,
  templateName,
  dueDate,
  checkInLink,
  unsubscribeUrl,
}: CheckInAssignedEmailProps) {
  return (
    <EmailLayout
      title="New check-in"
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
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
