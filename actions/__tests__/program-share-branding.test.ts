import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk_1' }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/services/ai.service', () => ({ generateProgram: vi.fn() }))
vi.mock('@/lib/services/program-categorization.service', () => ({
  categorizeGeneratedProgram: vi.fn().mockResolvedValue({
    bodyAreas: [], goals: [], activities: [], level: null, tags: [],
  }),
  buildCategorizationContextFromParams: vi.fn().mockReturnValue({}),
}))
vi.mock('@/lib/services/program-brief.service', () => ({
  extractProgramBriefText: vi.fn(),
  extractBriefMetadata: vi.fn(),
  parseProgramBrief: vi.fn(),
}))
vi.mock('@/lib/services/program.service', () => ({
  createProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'New Program' }),
  updateProgram: vi.fn().mockResolvedValue({ id: 'prog_1', name: 'Updated', status: 'ACTIVE' }),
  deleteProgram: vi.fn().mockResolvedValue({}),
  hardDeleteProgram: vi.fn().mockResolvedValue({}),
  deleteClientProgram: vi.fn().mockResolvedValue({}),
  duplicateProgram: vi.fn(),
  assignProgram: vi.fn(),
  toggleProgramPublic: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/audit-log.service', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(),
  deriveActorType: vi.fn(() => 'TRAINER'),
  AUDIT_ACTIONS: {},
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email/branding', () => ({
  getEmailBranding: vi.fn(),
  templateBrand: (b: { enabled: boolean; organizationName: string; accent: string; logoUrl?: string }) =>
    b.enabled ? { organizationName: b.organizationName, accent: b.accent, logoUrl: b.logoUrl } : undefined,
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { getEmailBranding } from '@/lib/email/branding'
import { shareProgramViaEmailAction } from '../program-actions'

const trainer = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1', firstName: 'Jane', lastName: 'Doe' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as never)
  vi.mocked(prisma.program.findUnique).mockResolvedValue({
    name: 'Knee Rehab', client: { firstName: 'Sam', lastName: 'Lee' },
  } as never)
  vi.mocked(sendEmail).mockResolvedValue(true)
})

describe('shareProgramViaEmailAction — org branding', () => {
  it("brands the email with the trainer's org and sets From name + Reply-To", async () => {
    vi.mocked(getEmailBranding).mockResolvedValue({
      enabled: true, organizationName: 'Summit PT', accent: '#0f766e',
      logoUrl: 'https://assets.test/l.png', fromName: 'Summit PT', replyTo: 'desk@summit.test',
    })

    const res = await shareProgramViaEmailAction('prog_1', 'sam@example.com', '')

    expect(res).toEqual({ success: true })
    expect(getEmailBranding).toHaveBeenCalledWith('org_1')
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.fromName).toBe('Summit PT')
    expect(call.replyTo).toBe('desk@summit.test')
    expect((call.react.props as Record<string, unknown>).brand).toEqual({
      organizationName: 'Summit PT', accent: '#0f766e', logoUrl: 'https://assets.test/l.png',
    })
  })

  it('sends the product look for an unbranded org', async () => {
    vi.mocked(getEmailBranding).mockResolvedValue({
      enabled: false, organizationName: 'INMOTUS RX', accent: '#2563eb', fromName: 'INMOTUS RX', replyTo: 'desk@summit.test',
    })

    await shareProgramViaEmailAction('prog_1', 'sam@example.com', '')

    const call = vi.mocked(sendEmail).mock.calls[0][0]
    // Unbranded client mail is sent exactly as before branding existed.
    expect('fromName' in call).toBe(false)
    expect('replyTo' in call).toBe(false)
    expect((call.react.props as Record<string, unknown>).brand).toBeUndefined()
  })
})
