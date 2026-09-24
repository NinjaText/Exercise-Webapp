import * as React from "react";
import { EmailLayout } from "./layout";

interface ExerciseNoteEmailProps {
  recipientName: string;
  clientName: string;
  workoutName: string;
  summary: string;
  sessionLink: string;
  unsubscribeUrl?: string;
}

export function ExerciseNoteEmail({
  recipientName,
  clientName,
  workoutName,
  summary,
  sessionLink,
  unsubscribeUrl,
}: ExerciseNoteEmailProps) {
  return (
    <EmailLayout
      title="New exercise note"
      accent="#2563eb"
      greeting={`Hi ${recipientName},`}
      intro={`${clientName} left a note while training.`}
      details={[
        { label: "Client", value: clientName },
        { label: "Workout", value: workoutName },
        { label: "Noted on", value: summary },
      ]}
      cta={{ label: "View Session", href: sessionLink }}
      reason="You received this email because your Sessions notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "session" } : undefined}
    />
  );
}
