import * as React from 'react'
import { EmailLayout } from './layout'
import type { EmailBrandProps } from '@/lib/email/branding'

interface ShareProgramEmailProps {
  programName: string
  clientName: string | null
  senderName: string
  pdfLink: string
  organizationName?: string
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps
}

export function ShareProgramEmail({
  brand,
  programName,
  clientName,
  senderName,
  pdfLink,
  organizationName,
}: ShareProgramEmailProps) {
  return (
    <EmailLayout
      title="Your Exercise Plan"
      organizationName={brand?.organizationName ?? organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
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
