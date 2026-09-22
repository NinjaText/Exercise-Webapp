import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/services/notification-preference.service', () => ({
  readPreference: vi.fn(),
  updatePreference: vi.fn(),
  PREFERENCE_DEFAULTS: {
    emailEnabled: true, sessions: true, messages: true, nutrition: true, billing: true,
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser } from '@/lib/current-user'
import { readPreference, updatePreference } from '@/lib/services/notification-preference.service'
import { revalidatePath } from 'next/cache'
import { getMyPreferenceAction, updateMyPreferenceAction } from '../notification-preference-actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' } as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getMyPreferenceAction', () => {
  it('returns the current user preferences', async () => {
    vi.mocked(readPreference).mockResolvedValue({
      emailEnabled: true, sessions: false, messages: true, nutrition: true, billing: true,
    })

    await expect(getMyPreferenceAction()).resolves.toEqual({
      ok: true,
      values: { emailEnabled: true, sessions: false, messages: true, nutrition: true, billing: true },
    })
    expect(readPreference).toHaveBeenCalledWith('u1')
  })

  // The dispatcher's fail-closed all-false value must never reach the form:
  // it is indistinguishable from a real opt-out, and the form posts every key
  // on save, so one click would make a read blip a permanent mute.
  it('reports a read failure instead of returning all-off values', async () => {
    vi.mocked(readPreference).mockRejectedValue(new Error('db down'))

    const result = await getMyPreferenceAction()

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('values')
  })
})

describe('updateMyPreferenceAction', () => {
  it('writes the patch for the current user and revalidates', async () => {
    const res = await updateMyPreferenceAction({ messages: false })

    expect(res).toEqual({ success: true })
    expect(updatePreference).toHaveBeenCalledWith('u1', { messages: false })
    expect(revalidatePath).toHaveBeenCalledWith('/settings/notifications')
  })

  it('strips any key that is not an editable boolean', async () => {
    await updateMyPreferenceAction({
      messages: false, billing: false, userId: 'someone-else', emailEnabled: 'yes',
    } as never)

    expect(updatePreference).toHaveBeenCalledWith('u1', { messages: false })
  })

  it('returns an error instead of throwing when the write fails', async () => {
    vi.mocked(updatePreference).mockRejectedValue(new Error('db down'))

    await expect(updateMyPreferenceAction({ messages: false })).resolves.toEqual({
      success: false,
      error: 'Failed to save notification preferences',
    })
  })

  it('returns an error when there is no signed-in user', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'))

    await expect(updateMyPreferenceAction({ messages: false })).resolves.toMatchObject({
      success: false,
    })
    expect(updatePreference).not.toHaveBeenCalled()
  })
})
