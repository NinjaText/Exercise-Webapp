import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface FeedbackResponseEmailProps {
  recipientName: string;
  trainerName: string;
  responsePreview: string;
  dashboardLink: string;
  unsubscribeUrl?: string;
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps;
}

export function FeedbackResponseEmail({
  brand,
  recipientName,
  trainerName,
  responsePreview,
  dashboardLink,
  unsubscribeUrl,
}: FeedbackResponseEmailProps) {
  return (
    <EmailLayout
      title="Feedback reply"
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
      greeting={`Hi ${recipientName},`}
      intro={`${trainerName} replied to the feedback you left on an exercise.`}
      quote={responsePreview}
      cta={{ label: "View Reply", href: dashboardLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
