import * as React from "react";
import { EmailLayout } from "./layout";

interface RefundProcessedEmailProps {
  recipientName: string;
  amount: string;
  programCount: number;
}

export function RefundProcessedEmail({
  recipientName,
  amount,
  programCount,
}: RefundProcessedEmailProps) {
  return (
    <EmailLayout
      title="Refund processed"
      accent="#16a34a"
      greeting={`Hi ${recipientName},`}
      intro="Your refund has been processed and should appear on your statement within 5–10 business days."
      details={[
        { label: "Amount", value: amount },
        {
          label: "Programs",
          value: `${programCount} program${programCount === 1 ? "" : "s"} paused`,
        },
      ]}
      footnote="If you believe this refund was issued in error, reply to this email and we will look into it."
      reason="This is a billing notification and is always sent."
    />
  );
}
