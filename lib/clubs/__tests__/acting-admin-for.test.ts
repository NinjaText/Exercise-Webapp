import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieGet = vi.fn()
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }))
vi.mock('@/lib/clubs/admin-session-token', () => ({
  CLUB_ADMIN_COOKIE: 'club_admin_session',
  verifyClubAdminMarker: vi.fn(),
}))

import { verifyClubAdminMarker } from '@/lib/clubs/admin-session-token'
import { getActingAdminFor } from '../acting-admin-for'

const marker = { sid: 's', adminUserId: 'a1', adminName: 'Ada', clerkOrgId: 'o', houseCoachClerkId: 'clerk_hc', exp: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  cookieGet.mockReturnValue({ value: 'tok' })
  vi.mocked(verifyClubAdminMarker).mockResolvedValue(marker)
})

describe('getActingAdminFor', () => {
  it('returns the marker for the bound house coach', async () => {
    expect(await getActingAdminFor({ clerkId: 'clerk_hc', role: 'TRAINER' })).toEqual(marker)
  })
  it('ignores a marker issued for a different user', async () => {
    expect(await getActingAdminFor({ clerkId: 'clerk_other', role: 'TRAINER' })).toBeNull()
  })
  it('skips clients and users without a clerkId without reading the cookie', async () => {
    expect(await getActingAdminFor({ clerkId: 'clerk_hc', role: 'CLIENT' })).toBeNull()
    expect(await getActingAdminFor({ role: 'TRAINER' })).toBeNull()
    expect(cookieGet).not.toHaveBeenCalled()
  })
  it('returns null with no cookie, skipping verification', async () => {
    cookieGet.mockReturnValue(undefined)
    expect(await getActingAdminFor({ clerkId: 'clerk_hc', role: 'TRAINER' })).toBeNull()
    expect(verifyClubAdminMarker).not.toHaveBeenCalled()
  })
})
