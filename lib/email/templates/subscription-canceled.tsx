import * as React from "react";
import { EmailLayout } from "./layout";

interface SubscriptionCanceledEmailProps {
  recipientName: string;
  billingLink: string;
}

export function SubscriptionCanceledEmail({
  recipientName,
  billingLink,
}: SubscriptionCanceledEmailProps) {
  return (
    <EmailLayout
      title="Subscription canceled"
      accent="#2563eb"
      greeting={`Hi ${recipientName},`}
      intro="Your subscription has been canceled. Your client data and programs are kept, and resubscribing restores access to them at any time."
      cta={{ label: "View Billing", href: billingLink }}
      reason="This is a billing notification and is always sent."
    />
  );
}
