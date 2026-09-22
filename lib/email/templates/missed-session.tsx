import * as React from 'react'
import { EmailLayout, Paragraph } from './layout'

interface MissedSessionEmailProps {
  trainerName: string
  clientName: string
  missedCount: number
  lookbackDays: number
  clientLink: string
  organizationName?: string
  unsubscribeUrl?: string
}

export function MissedSessionEmail({
  trainerName,
  clientName,
  missedCount,
  lookbackDays,
  clientLink,
  organizationName,
  unsubscribeUrl,
}: MissedSessionEmailProps) {
  return (
    <EmailLayout
      title="Missed Sessions Alert"
      organizationName={organizationName}
      accent="#dc2626"
      greeting={`Hi ${trainerName},`}
      intro={
        <>
          This is an alert that <strong>{clientName}</strong> has missed{' '}
          <strong>
            {missedCount} session{missedCount !== 1 ? 's' : ''}
          </strong>{' '}
          in the last {lookbackDays} days.
        </>
      }
      details={[
        { label: 'Client', value: clientName },
        { label: 'Missed sessions', value: String(missedCount) },
        { label: 'Period', value: `Last ${lookbackDays} days` },
      ]}
      cta={{ label: 'View Client', href: clientLink }}
      reason="You received this email because your Sessions notifications are on."
      unsubscribe={unsubscribeUrl ? { url: unsubscribeUrl, categoryLabel: 'session' } : undefined}
    >
      <Paragraph>You may want to reach out to check in with your client.</Paragraph>
    </EmailLayout>
  )
}
