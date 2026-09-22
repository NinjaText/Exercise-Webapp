import * as React from "react";
import { EmailLayout } from "./layout";

interface NutritionNudgeEmailProps {
  recipientName: string;
  headline: string;
  detail: string;
  nutritionLink: string;
  unsubscribeUrl?: string;
}

export function NutritionNudgeEmail({
  recipientName,
  headline,
  detail,
  nutritionLink,
  unsubscribeUrl,
}: NutritionNudgeEmailProps) {
  return (
    <EmailLayout
      title={headline}
      accent="#2563eb"
      greeting={`Hi ${recipientName},`}
      intro={detail}
      cta={{ label: "Open Nutrition", href: nutritionLink }}
      footnote="Nudges are sent at most once a day per goal."
      reason="You received this email because your Nutrition notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "nutrition" } : undefined}
    />
  );
}
