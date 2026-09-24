import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { render } from '@react-email/render'
import { NewMessageEmail } from '@/lib/email/templates/new-message'
import { PaymentFailedEmail } from '@/lib/email/templates/payment-failed'

/**
 * Guards the render path PRODUCTION actually uses.
 *
 * The other template tests render with `renderToStaticMarkup` from
 * `react-dom/server`, which always worked. But `resend.emails.send({ react })`
 * renders through `@react-email/render`, which resend declares as an OPTIONAL
 * peer dependency — so npm installs it silently only if it is declared here.
 *
 * It was not declared, and every send failed at runtime with "Failed to render
 * React component" while every test passed. This file fails if that dependency
 * goes missing again.
 */
describe('the @react-email/render path used by resend.emails.send', () => {
  it('renders a non-transactional template to HTML', async () => {
    const html = await render(
      React.createElement(NewMessageEmail, {
        recipientName: 'Sarah Lee',
        senderName: 'Mike Chen',
        sentAt: 'March 3 at 2:14 PM',
        preview: 'Great work on the squat progression this week.',
        messagesLink: 'https://app.test/messages',
        unsubscribeUrl: 'https://app.test/api/notifications/unsubscribe?token=abc&category=messages',
      })
    )

    expect(html).toContain('Sarah Lee')
    expect(html).toContain('Mike Chen')
    expect(html).toContain('squat progression')
    expect(html).toContain('https://app.test/messages')
    expect(html).toContain('Unsubscribe')
  })

  it('renders a transactional template, with no unsubscribe link', async () => {
    const html = await render(
      React.createElement(PaymentFailedEmail, {
        recipientName: 'Mike Chen',
        amountDue: '$49.00',
        billingLink: 'https://app.test/settings/billing',
      })
    )

    expect(html).toContain('Mike Chen')
    expect(html).toContain('$49.00')
    expect(html).not.toContain('Unsubscribe')
  })
})
