import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/outcome.service', () => ({ recordAssessment: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as outcomeService from '@/lib/services/outcome.service'
import { createAssessmentAction } from '../assessment-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockRecordAssessment = vi.mocked(outcomeService.recordAssessment)

const dbTrainer = { id: 'trainer_1', clerkId: 'clerk_1', role: 'TRAINER' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createAssessmentAction', () => {
  it('allows a trainer recording an assessment for a roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockRecordAssessment.mockResolvedValue({ id: 'assessment_1' } as never)

    const result = await createAssessmentAction({
      clientId: 'client_1',
      assessmentType: 'weight',
      value: 150,
      unit: 'lbs',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer recording an assessment for a non-roster client', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_1' } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createAssessmentAction({
      clientId: 'client_1',
      assessmentType: 'weight',
      value: 150,
      unit: 'lbs',
    })

    expect(result.success).toBe(false)
    expect(mockRecordAssessment).not.toHaveBeenCalled()
  })
})
