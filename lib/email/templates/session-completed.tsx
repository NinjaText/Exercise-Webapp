import * as React from 'react'
import { EmailLayout } from './layout'

interface SessionCompletedEmailProps {
  trainerName: string
  clientName: string
  workoutName: string
  programName: string
  clientLink: string
  organizationName?: string
  unsubscribeUrl?: string
}

export function SessionCompletedEmail({
  trainerName,
  clientName,
  workoutName,
  programName,
  clientLink,
  organizationName,
  unsubscribeUrl,
}: SessionCompletedEmailProps) {
  return (
    <EmailLayout
      title="Session Completed"
      organizationName={organizationName}
      accent="#16a34a"
      greeting={`Hi ${trainerName},`}
      intro={
        <>
          Your client <strong>{clientName}</strong> just completed a workout session.
        </>
      }
      details={[
        { label: 'Client', value: clientName },
        { label: 'Workout', value: workoutName },
        { label: 'Program', value: programName },
      ]}
      cta={{ label: 'View Client Progress', href: clientLink }}
      reason="You received this email because your Sessions notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: 'session' } : undefined}
    />
  )
}
