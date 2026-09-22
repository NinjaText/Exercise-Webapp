import * as React from "react";
import { EmailLayout } from "./layout";

interface FeedbackResponseEmailProps {
  recipientName: string;
  trainerName: string;
  responsePreview: string;
  dashboardLink: string;
  unsubscribeUrl?: string;
}

export function FeedbackResponseEmail({
  recipientName,
  trainerName,
  responsePreview,
  dashboardLink,
  unsubscribeUrl,
}: FeedbackResponseEmailProps) {
  return (
    <EmailLayout
      title="Feedback reply"
      accent="#2563eb"
      greeting={`Hi ${recipientName},`}
      intro={`${trainerName} replied to the feedback you left on an exercise.`}
      quote={responsePreview}
      cta={{ label: "View Reply", href: dashboardLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
