import * as React from "react";
import { EmailLayout } from "./layout";

interface NewMessageEmailProps {
  recipientName: string;
  senderName: string;
  sentAt: string;
  preview: string;
  messagesLink: string;
  unsubscribeUrl?: string;
}

export function NewMessageEmail({
  recipientName,
  senderName,
  sentAt,
  preview,
  messagesLink,
  unsubscribeUrl,
}: NewMessageEmailProps) {
  return (
    <EmailLayout
      title="New message"
      accent="#2563eb"
      greeting={`Hi ${recipientName},`}
      intro={`${senderName} sent you a message.`}
      details={[
        { label: "From", value: senderName },
        { label: "Sent", value: sentAt },
      ]}
      quote={preview}
      cta={{ label: "View Message", href: messagesLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  );
}
