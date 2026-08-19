import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/progress.service', () => ({ addBodyMetric: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as progressService from '@/lib/services/progress.service'
import { addBodyMetricAction } from '../progress-actions'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockAddBodyMetric = vi.mocked(progressService.addBodyMetric)

const trainer = { id: 'trainer_1', role: 'TRAINER' }
const client = { id: 'client_1', role: 'CLIENT' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addBodyMetricAction', () => {
  it('allows a client adding their own metric', async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)
    mockAddBodyMetric.mockResolvedValue({ id: 'metric_1' } as never)

    const result = await addBodyMetricAction('client_1', 'weight', 150, 'lbs')

    expect(result.success).toBe(true)
  })

  it("rejects a client adding another client's metric", async () => {
    mockGetCurrentUser.mockResolvedValue(client as never)

    const result = await addBodyMetricAction('someone_else', 'weight', 150, 'lbs')

    expect(result.success).toBe(false)
    expect(mockAddBodyMetric).not.toHaveBeenCalled()
  })

  it('allows a trainer adding a metric for a roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockAddBodyMetric.mockResolvedValue({ id: 'metric_1' } as never)

    const result = await addBodyMetricAction('client_1', 'weight', 150, 'lbs')

    expect(result.success).toBe(true)
  })

  it('rejects a trainer adding a metric for a non-roster client', async () => {
    mockGetCurrentUser.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await addBodyMetricAction('client_1', 'weight', 150, 'lbs')

    expect(result.success).toBe(false)
    expect(mockAddBodyMetric).not.toHaveBeenCalled()
  })
})
