import * as React from "react";
import { EmailLayout } from "./layout";

interface NutritionCommentEmailProps {
  recipientName: string;
  authorName: string;
  commentPreview: string;
  nutritionLink: string;
  isReply: boolean;
  unsubscribeUrl?: string;
}

export function NutritionCommentEmail({
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
      accent="#2563eb"
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
