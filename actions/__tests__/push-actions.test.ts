import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/services/push-device.service', () => ({
  registerDevice: vi.fn(),
  unregisterToken: vi.fn(),
  isValidPushToken: vi.fn(),
}))

import { getCurrentUser } from '@/lib/current-user'
import {
  registerDevice,
  unregisterToken,
  isValidPushToken,
} from '@/lib/services/push-device.service'
import { registerPushDeviceAction, unregisterPushDeviceAction } from '../push-actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' } as never)
  vi.mocked(isValidPushToken).mockImplementation(
    (t: unknown) => typeof t === 'string' && t.length > 0
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('registerPushDeviceAction', () => {
  it('registers a valid ios device for the current user', async () => {
    const res = await registerPushDeviceAction({
      token: 'tok_abc',
      platform: 'ios',
      appVersion: '1.0',
    })

    expect(res).toEqual({ success: true })
    expect(registerDevice).toHaveBeenCalledWith({
      userId: 'u1',
      token: 'tok_abc',
      platform: 'ios',
      appVersion: '1.0',
    })
  })

  it('registers a valid android device with a null appVersion when omitted', async () => {
    const res = await registerPushDeviceAction({ token: 'tok_fcm', platform: 'android' })

    expect(res).toEqual({ success: true })
    expect(registerDevice).toHaveBeenCalledWith({
      userId: 'u1',
      token: 'tok_fcm',
      platform: 'android',
      appVersion: null,
    })
  })

  it('rejects an invalid token without registering', async () => {
    vi.mocked(isValidPushToken).mockReturnValue(false)

    const res = await registerPushDeviceAction({ token: '', platform: 'ios' })

    expect(res).toEqual({ success: false })
    expect(registerDevice).not.toHaveBeenCalled()
  })

  it('rejects an unrecognised platform without registering', async () => {
    const res = await registerPushDeviceAction({
      token: 'tok_abc',
      platform: 'windows',
    })

    expect(res).toEqual({ success: false })
    expect(registerDevice).not.toHaveBeenCalled()
  })

  it('fails soft when there is no signed-in user', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'))

    await expect(
      registerPushDeviceAction({ token: 'tok_abc', platform: 'ios' })
    ).resolves.toEqual({ success: false })
    expect(registerDevice).not.toHaveBeenCalled()
  })
})

describe('error logging', () => {
  it('logs a fixed message with only the error name and code, never the raw error', async () => {
    const err = Object.assign(new Error('Unique constraint failed on token tok_secret'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    })
    vi.mocked(registerDevice).mockRejectedValueOnce(err)
    vi.mocked(unregisterToken).mockRejectedValueOnce(err)

    await registerPushDeviceAction({ token: 'tok_secret', platform: 'ios' })
    await unregisterPushDeviceAction({ token: 'tok_secret' })

    expect(console.error).toHaveBeenNthCalledWith(1, '[push] Failed to register push device', {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    })
    expect(console.error).toHaveBeenNthCalledWith(2, '[push] Failed to unregister push device', {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('tok_secret')
  })
})

describe('unregisterPushDeviceAction', () => {
  it('unregisters the token scoped to the current user', async () => {
    const res = await unregisterPushDeviceAction({ token: 'tok_abc' })

    expect(res).toEqual({ success: true })
    expect(unregisterToken).toHaveBeenCalledWith('tok_abc', 'u1')
  })

  it('fails soft when there is no signed-in user', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'))

    await expect(unregisterPushDeviceAction({ token: 'tok_abc' })).resolves.toEqual({
      success: false,
    })
    expect(unregisterToken).not.toHaveBeenCalled()
  })
})
