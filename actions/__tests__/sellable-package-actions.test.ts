import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    program: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/services/program.service', () => ({
  getTemplates: vi.fn(),
}))
vi.mock('@/lib/services/sellable-package.service', () => ({
  createSellablePackage: vi.fn(),
  getSellablePackageByProgramTemplateId: vi.fn(),
  updateSellablePackage: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getTemplates } from '@/lib/services/program.service'
import {
  createSellablePackage,
  getSellablePackageByProgramTemplateId,
  updateSellablePackage,
} from '@/lib/services/sellable-package.service'
import {
  createSellablePackageAction,
  getSellablePackageForProgramAction,
  getTrainerTemplatesForBundleAction,
  updateSellablePackageAction,
} from '../sellable-package-actions'

const trainer = { id: 'trainer1', role: 'TRAINER' }
const ownedTemplate = { id: 'prog1', trainerId: 'trainer1', isTemplate: true, clientId: null, name: 'Golf Back Pain' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'clerk_trainer1' } as any)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(trainer as any)
})

describe('getSellablePackageForProgramAction', () => {
  it('rejects when not a trainer', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const result = await getSellablePackageForProgramAction('prog1')
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('rejects when the program is not an owned template', async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue({ ...ownedTemplate, trainerId: 'someone-else' } as any)
    const result = await getSellablePackageForProgramAction('prog1')
    expect(result).toEqual({ success: false, error: 'Program not found' })
  })

  it('returns the resolved package for an owned template', async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue(ownedTemplate as any)
    vi.mocked(getSellablePackageByProgramTemplateId).mockResolvedValue({ id: 'pkg1' } as any)
    const result = await getSellablePackageForProgramAction('prog1')
    expect(result).toEqual({ success: true, data: { id: 'pkg1' } })
    expect(getSellablePackageByProgramTemplateId).toHaveBeenCalledWith('prog1', 'trainer1')
  })
})

describe('getTrainerTemplatesForBundleAction', () => {
  it('excludes the given program id from the trainer\'s templates', async () => {
    vi.mocked(getTemplates).mockResolvedValue([
      { id: 'prog1', name: 'Golf Back Pain' },
      { id: 'prog2', name: 'Warm-up Routine' },
    ] as any)
    const result = await getTrainerTemplatesForBundleAction('prog1')
    expect(result).toEqual({ success: true, data: [{ id: 'prog2', name: 'Warm-up Routine' }] })
  })
})

describe('createSellablePackageAction', () => {
  beforeEach(() => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue(ownedTemplate as any)
  })

  it('rejects a zero or negative price', async () => {
    const result = await createSellablePackageAction({ programId: 'prog1', priceInCents: 0 })
    expect(result).toEqual({ success: false, error: 'Price must be greater than zero' })
    expect(createSellablePackage).not.toHaveBeenCalled()
  })

  it('creates a package with no bundle', async () => {
    vi.mocked(createSellablePackage).mockResolvedValue({ id: 'pkg1' } as any)
    const result = await createSellablePackageAction({ programId: 'prog1', priceInCents: 7999 })
    expect(result).toEqual({ success: true, data: { id: 'pkg1' } })
    expect(createSellablePackage).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: 'trainer1', programTemplateId: 'prog1', priceInCents: 7999, kind: 'program' })
    )
  })

  it('creates the bundle package first, then the main package with upsellPackageId set', async () => {
    vi.mocked(prisma.program.findUnique)
      .mockResolvedValueOnce(ownedTemplate as any) // main program ownership check
      .mockResolvedValueOnce({ id: 'prog2', trainerId: 'trainer1', isTemplate: true, clientId: null, name: 'Warm-up' } as any) // bundle template ownership check
    vi.mocked(createSellablePackage)
      .mockResolvedValueOnce({ id: 'bundlePkg' } as any)
      .mockResolvedValueOnce({ id: 'mainPkg' } as any)

    const result = await createSellablePackageAction({
      programId: 'prog1',
      priceInCents: 7999,
      bundle: { programTemplateId: 'prog2', priceInCents: 2999 },
    })

    expect(result).toEqual({ success: true, data: { id: 'mainPkg' } })
    expect(createSellablePackage).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ programTemplateId: 'prog2', priceInCents: 2999, kind: 'bundle' })
    )
    expect(createSellablePackage).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ programTemplateId: 'prog1', upsellPackageId: 'bundlePkg' })
    )
  })
})

describe('updateSellablePackageAction', () => {
  it('rejects a zero or negative bundle price', async () => {
    const result = await updateSellablePackageAction({
      packageId: 'pkg1',
      programId: 'prog1',
      bundle: { programTemplateId: 'prog2', priceInCents: 0 },
    })
    expect(result).toEqual({ success: false, error: 'Bundle price must be greater than zero' })
    expect(updateSellablePackage).not.toHaveBeenCalled()
  })

  it('rejects when the bundle template is not owned by the trainer', async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValueOnce({
      id: 'prog2', trainerId: 'someone-else', isTemplate: true, clientId: null, name: 'Not Mine',
    } as any)
    const result = await updateSellablePackageAction({
      packageId: 'pkg1',
      programId: 'prog1',
      bundle: { programTemplateId: 'prog2', priceInCents: 2999 },
    })
    expect(result).toEqual({ success: false, error: 'Bundle template not found' })
    expect(updateSellablePackage).not.toHaveBeenCalled()
  })

  it('updates the package and returns it', async () => {
    vi.mocked(updateSellablePackage).mockResolvedValue({ id: 'pkg1', isActive: false } as any)
    const result = await updateSellablePackageAction({ packageId: 'pkg1', programId: 'prog1', isActive: false })
    expect(result).toEqual({ success: true, data: { id: 'pkg1', isActive: false } })
    expect(updateSellablePackage).toHaveBeenCalledWith('pkg1', 'trainer1', {
      priceInCents: undefined,
      isActive: false,
      bundle: undefined,
    })
  })
})
