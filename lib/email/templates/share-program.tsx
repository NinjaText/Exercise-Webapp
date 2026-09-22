import * as React from 'react'
import { EmailLayout } from './layout'

interface ShareProgramEmailProps {
  programName: string
  clientName: string | null
  senderName: string
  pdfLink: string
  organizationName?: string
}

export function ShareProgramEmail({
  programName,
  clientName,
  senderName,
  pdfLink,
  organizationName,
}: ShareProgramEmailProps) {
  return (
    <EmailLayout
      title="Your Exercise Plan"
      organizationName={organizationName}
      accent="#2563eb"
      greeting={clientName ? `Hi ${clientName},` : 'Hello,'}
      intro={`${senderName} has shared your exercise plan with you.`}
      details={[
        { label: 'Program', value: programName },
        { label: 'Prepared by', value: senderName },
      ]}
      cta={{ label: 'Download Exercise Plan (PDF)', href: pdfLink }}
      footnote="This link opens directly to your exercise plan. If you have questions, please contact your care team."
    />
  )
}
