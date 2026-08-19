import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/current-user', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/services/client.service', () => ({ getClientIdsForTrainer: vi.fn() }))
vi.mock('@/lib/services/clinical-note.service', () => ({ createNote: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireRole } from '@/lib/current-user'
import { getClientIdsForTrainer } from '@/lib/services/client.service'
import * as noteService from '@/lib/services/clinical-note.service'
import { createClinicalNoteAction } from '../clinical-note-actions'

const mockRequireRole = vi.mocked(requireRole)
const mockGetClientIds = vi.mocked(getClientIdsForTrainer)
const mockCreateNote = vi.mocked(noteService.createNote)

const trainer = { id: 'trainer_1', firstName: 'Jane', lastName: 'Doe', clerkOrgId: 'org_1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createClinicalNoteAction', () => {
  it('allows a trainer creating a note for a roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['client_1'])
    mockCreateNote.mockResolvedValue({ id: 'note_1' } as never)

    const result = await createClinicalNoteAction('client_1', { appointmentDate: '2026-08-20' })

    expect(result.success).toBe(true)
  })

  it('rejects a trainer creating a note for a non-roster client', async () => {
    mockRequireRole.mockResolvedValue(trainer as never)
    mockGetClientIds.mockResolvedValue(['someone_else'])

    const result = await createClinicalNoteAction('client_1', { appointmentDate: '2026-08-20' })

    expect(result.success).toBe(false)
    expect(mockCreateNote).not.toHaveBeenCalled()
  })
})
