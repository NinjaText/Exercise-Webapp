import * as React from "react";
import { EmailLayout } from "./layout";

interface SessionReminderEmailProps {
  clientName: string;
  sessionDate: string;
  sessionTime: string;
  workoutName: string;
  sessionLink: string;
  organizationName?: string;
  unsubscribeUrl?: string;
}

/**
 * React Email template for session reminder notifications.
 * Rendered server-side by Resend and sent as HTML email.
 */
export function SessionReminderEmail({
  clientName,
  sessionDate,
  sessionTime,
  workoutName,
  sessionLink,
  organizationName,
  unsubscribeUrl,
}: SessionReminderEmailProps) {
  return (
    <EmailLayout
      title="Session Reminder"
      organizationName={organizationName}
      accent="#2563eb"
      greeting={`Hi ${clientName},`}
      intro="This is a friendly reminder that you have a workout session scheduled for tomorrow."
      details={[
        { label: "Workout", value: workoutName },
        { label: "Date", value: sessionDate },
        { label: "Time", value: sessionTime },
      ]}
      cta={{ label: "View Your Session", href: sessionLink }}
      footnote="If you have any questions or need to reschedule, please reach out to your care team through the platform."
      reason="You received this email because your Sessions notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "session" } : undefined}
    />
  );
}
