import * as React from "react"
import { EmailLayout } from "./layout"
import type { EmailBrandProps } from "@/lib/email/branding"

interface VoiceMemoAddedEmailProps {
  recipientName: string
  senderName: string
  workoutName: string
  sessionLink: string
  role: "trainer" | "client"
  unsubscribeUrl?: string
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps
}

export function VoiceMemoAddedEmail({
  brand,
  recipientName,
  senderName,
  workoutName,
  sessionLink,
  role,
  unsubscribeUrl,
}: VoiceMemoAddedEmailProps) {
  return (
    <EmailLayout
      title="Voice Memo"
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#16a34a"}
      logoUrl={brand?.logoUrl}
      greeting={`Hi ${recipientName},`}
      intro={
        role === "client" ? (
          <>Your trainer <strong>{senderName}</strong> recorded a coaching note for <strong>{workoutName}</strong>. Open the app to listen before your session.</>
        ) : (
          <>Your client <strong>{senderName}</strong> completed <strong>{workoutName}</strong> and left you a voice response.</>
        )
      }
      details={[
        { label: "From", value: senderName },
        { label: "Workout", value: workoutName },
      ]}
      cta={{ label: role === "client" ? "Listen to Voice Note" : "View Client Response", href: sessionLink }}
      reason="You received this email because your Messages & check-ins notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: "message" } : undefined}
    />
  )
}
