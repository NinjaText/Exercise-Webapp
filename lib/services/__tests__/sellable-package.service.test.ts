import { describe, it, expect, vi, beforeEach } from 'vitest'

// `getSellablePackageBySlug` is `React.cache()`-wrapped (dedupes the sales
// page's generateMetadata + page-body lookups); make it a passthrough here
// so each test call reaches the mocked prisma call, same as branding.service.test.ts.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachPackage: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { slugify } from '@/lib/utils/slug'
import { prisma } from '@/lib/prisma'
import { createSellablePackage, getSellablePackageBySlug, getSellablePackageByProgramTemplateId, updateSellablePackage } from '../sellable-package.service'

const mockFindFirst = vi.mocked(prisma.coachPackage.findFirst)
const mockFindUnique = vi.mocked(prisma.coachPackage.findUnique)
const mockCreate = vi.mocked(prisma.coachPackage.create)
const mockUpdate = vi.mocked(prisma.coachPackage.update)

beforeEach(() => vi.clearAllMocks())

describe('slugify', () => {
  it('lowercases, trims, and hyphenates', () => {
    expect(slugify('  Golf Back Pain! Program ')).toBe('golf-back-pain-program')
  })
  it('collapses repeated separators', () => {
    expect(slugify('Jane   & Co --- Golf')).toBe('jane-co-golf')
  })
})

describe('createSellablePackage', () => {
  it('creates a package with a unique slug derived from the name', async () => {
    mockFindUnique.mockResolvedValue(null) // slug is free
    mockCreate.mockResolvedValue({ id: 'pkg1' } as any)

    const pkg = await createSellablePackage({
      trainerId: 'trainer1',
      name: 'Golf Back Pain',
      priceInCents: 7999,
      programTemplateId: 'tmpl1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trainerId: 'trainer1',
          name: 'Golf Back Pain',
          priceInCents: 7999,
          programTemplateId: 'tmpl1',
          slug: 'golf-back-pain',
          kind: 'program',
        }),
      })
    )
    expect(pkg.id).toBe('pkg1')
  })

  it('appends a numeric suffix when the base slug is taken', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'existing' } as any) // 'golf-back-pain' taken
      .mockResolvedValueOnce(null)                       // 'golf-back-pain-2' free
    mockCreate.mockResolvedValue({ id: 'pkg2' } as any)

    await createSellablePackage({
      trainerId: 'trainer1',
      name: 'Golf Back Pain',
      priceInCents: 7999,
      programTemplateId: 'tmpl1',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'golf-back-pain-2' }) })
    )
  })
})

describe('getSellablePackageBySlug', () => {
  it('returns null for an inactive or missing package', async () => {
    mockFindFirst.mockResolvedValue(null)
    expect(await getSellablePackageBySlug('nope')).toBeNull()
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { slug: 'nope', isActive: true },
      include: { trainer: { select: { clerkOrgId: true } } },
    })
  })

  it('resolves the upsell package when present', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'pkg1',
      slug: 'golf',
      upsellPackageId: 'pkg2',
      isActive: true,
      trainer: { clerkOrgId: 'org_123' },
    } as any)
    mockFindUnique.mockResolvedValue({ id: 'pkg2', slug: 'bundle', isActive: true } as any)

    const result = await getSellablePackageBySlug('golf')
    expect(result?.id).toBe('pkg1')
    expect(result?.upsell?.id).toBe('pkg2')
    expect(result?.trainer.clerkOrgId).toBe('org_123')
  })

  it('passes through a null clerkOrgId for a trainer with no organization', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'pkg1',
      slug: 'golf',
      upsellPackageId: null,
      isActive: true,
      trainer: { clerkOrgId: null },
    } as unknown as Awaited<ReturnType<typeof prisma.coachPackage.findFirst>>)

    const result = await getSellablePackageBySlug('golf')
    expect(result?.trainer.clerkOrgId).toBeNull()
  })
})

describe('getSellablePackageByProgramTemplateId', () => {
  it('returns null when the trainer has no package for that template', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await getSellablePackageByProgramTemplateId('tmpl1', 'trainer1')
    expect(result).toBeNull()
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { programTemplateId: 'tmpl1', trainerId: 'trainer1', kind: 'program' },
    })
  })

  it('returns the package with upsell: null when it has no bundle', async () => {
    mockFindFirst.mockResolvedValue({ id: 'pkg1', upsellPackageId: null } as any)
    const result = await getSellablePackageByProgramTemplateId('tmpl1', 'trainer1')
    expect(result?.id).toBe('pkg1')
    expect(result?.upsell).toBeNull()
  })

  it('resolves the bundle package when upsellPackageId is set', async () => {
    mockFindFirst.mockResolvedValue({ id: 'pkg1', upsellPackageId: 'pkg2' } as any)
    mockFindUnique.mockResolvedValue({ id: 'pkg2', kind: 'bundle' } as any)
    const result = await getSellablePackageByProgramTemplateId('tmpl1', 'trainer1')
    expect(result?.upsell?.id).toBe('pkg2')
  })
})

describe('updateSellablePackage', () => {
  it('throws when the package does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(updateSellablePackage('pkg1', 'trainer1', {})).rejects.toThrow('Package not found')
  })

  it('throws when the package belongs to a different trainer', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'someone-else' } as any)
    await expect(updateSellablePackage('pkg1', 'trainer1', {})).rejects.toThrow('Package not found')
  })

  it('updates price and isActive without touching the bundle when bundle is omitted', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: 'pkg2', name: 'Golf' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', { priceInCents: 8999, isActive: false })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pkg1' },
      data: { priceInCents: 8999, isActive: false, upsellPackageId: 'pkg2' },
    })
  })

  it('deactivates the existing bundle and clears upsellPackageId when bundle is null', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: 'pkg2', name: 'Golf' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', { bundle: null })

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'pkg2' }, data: { isActive: false } })
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: 'pkg1' },
      data: { upsellPackageId: null },
    })
  })

  it('creates a new bundle package when none existed before', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: null, name: 'Golf' } as any) // ownership check
      .mockResolvedValue(null) // uniqueSlug's collision check finds nothing
    const mockCreate = vi.mocked(prisma.coachPackage.create)
    mockCreate.mockResolvedValue({ id: 'newBundlePkg' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', {
      bundle: { programTemplateId: 'tmpl2', priceInCents: 2999 },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trainerId: 'trainer1',
        name: 'Golf Bundle',
        priceInCents: 2999,
        programTemplateId: 'tmpl2',
        kind: 'bundle',
      }),
    })
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: 'pkg1' },
      data: { upsellPackageId: 'newBundlePkg' },
    })
  })

  it('updates the existing bundle package in place when one already exists', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pkg1', trainerId: 'trainer1', upsellPackageId: 'pkg2', name: 'Golf' } as any)
    mockUpdate.mockResolvedValue({ id: 'pkg1' } as any)

    await updateSellablePackage('pkg1', 'trainer1', {
      bundle: { programTemplateId: 'tmpl3', priceInCents: 3499 },
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pkg2' },
      data: { programTemplateId: 'tmpl3', priceInCents: 3499, isActive: true },
    })
    expect(mockUpdate).toHaveBeenLastCalledWith({
      where: { id: 'pkg1' },
      data: { upsellPackageId: 'pkg2' },
    })
    // Only the existing bundle is touched — no new package created
    expect(prisma.coachPackage.create).not.toHaveBeenCalled()
  })
})
