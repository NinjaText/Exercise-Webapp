import * as React from "react";
import { EmailLayout } from "./layout";

interface PaymentFailedEmailProps {
  recipientName: string;
  amountDue: string;
  billingLink: string;
}

export function PaymentFailedEmail({
  recipientName,
  amountDue,
  billingLink,
}: PaymentFailedEmailProps) {
  return (
    <EmailLayout
      title="Payment failed"
      accent="#dc2626"
      greeting={`Hi ${recipientName},`}
      intro="We could not process your latest payment, so your subscription is now past due. Updating your payment method will restore full access."
      details={[{ label: "Amount", value: amountDue }]}
      cta={{ label: "Update Payment Method", href: billingLink }}
      footnote="If you have already updated your card, you can ignore this email — the next retry will go through."
      reason="This is a billing notification and is always sent."
    />
  );
}
