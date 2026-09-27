import * as React from "react";
import { EmailLayout } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface NutritionCommentEmailProps {
  recipientName: string;
  authorName: string;
  commentPreview: string;
  nutritionLink: string;
  isReply: boolean;
  unsubscribeUrl?: string;
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps;
}

export function NutritionCommentEmail({
  brand,
  recipientName,
  authorName,
  commentPreview,
  nutritionLink,
  isReply,
  unsubscribeUrl,
}: NutritionCommentEmailProps) {
  return (
    <EmailLayout
      title={isReply ? "Nutrition reply" : "Nutrition feedback"}
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
      greeting={`Hi ${recipientName},`}
      intro={
        isReply
          ? `${authorName} replied on their nutrition log.`
          : `${authorName} left feedback on your nutrition log.`
      }
      quote={commentPreview}
      cta={{ label: isReply ? "View Reply" : "View Feedback", href: nutritionLink }}
      reason="You received this email because your Nutrition notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "nutrition" } : undefined}
    />
  );
}
