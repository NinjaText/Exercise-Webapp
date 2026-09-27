import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface NutritionNudgeEmailProps {
  recipientName: string;
  headline: string;
  detail: string;
  nutritionLink: string;
  unsubscribeUrl?: string;
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps;
}

export function NutritionNudgeEmail({
  brand,
  recipientName,
  headline,
  detail,
  nutritionLink,
  unsubscribeUrl,
}: NutritionNudgeEmailProps) {
  return (
    <EmailLayout
      title={headline}
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
      greeting={`Hi ${recipientName},`}
      intro={detail}
      cta={{ label: "Open Nutrition", href: nutritionLink }}
      footnote="Nudges are sent at most once a day per goal."
      reason="You received this email because your Nutrition notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "nutrition" } : undefined}
    />
  );
}
