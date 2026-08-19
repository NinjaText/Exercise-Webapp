import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { workoutSessionV2: { findMany: vi.fn() } },
}))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/prisma'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import { getClientExerciseHistory } from '../exercise-history-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockSessionFindMany = vi.mocked(prisma.workoutSessionV2.findMany)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClientExerciseHistory', () => {
  it('propagates when the caller is unauthenticated (getCurrentUser redirects/throws)', async () => {
    // getCurrentUser() calls Next.js redirect() internally for an unauthenticated
    // caller, which throws a special signal Next.js's framework catches to actually
    // redirect the browser. It must NEVER be swallowed by a try/catch — this test
    // simulates that by having the mock reject, and asserts the rejection propagates
    // out of getClientExerciseHistory rather than being converted into a graceful
    // {success:false} return.
    mockGetCurrentUser.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(getClientExerciseHistory('client_1', 'exercise_1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('allows a client fetching their own exercise history', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientExerciseHistory('client_1', 'exercise_1')

    expect(result.success).toBe(true)
  })

  it("rejects a client fetching another client's exercise history", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)

    const result = await getClientExerciseHistory('someone_else', 'exercise_1')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })

  it('allows a trainer fetching a roster client\'s exercise history', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockSessionFindMany.mockResolvedValue([] as never)

    const result = await getClientExerciseHistory('client_1', 'exercise_1')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer fetching a non-roster client\'s exercise history', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await getClientExerciseHistory('client_1', 'exercise_1')

    expect(result.success).toBe(false)
    expect(mockSessionFindMany).not.toHaveBeenCalled()
  })
})
