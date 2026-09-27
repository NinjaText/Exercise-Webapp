import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface NewMessageEmailProps {
  recipientName: string;
  senderName: string;
  sentAt: string;
  preview: string;
  messagesLink: string;
  unsubscribeUrl?: string;
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps;
}

export function NewMessageEmail({
  brand,
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
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
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
