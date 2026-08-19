import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workout: { findUnique: vi.fn() },
    voiceMemo: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    program: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/lib/r2', () => ({
  getR2Client: vi.fn(() => ({ send: vi.fn() })),
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://pub.r2.dev',
}))
vi.mock('@/lib/pusher', () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/lib/email/resend', () => ({
  getResend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({}) } })),
}))
vi.mock('@/lib/email/templates/voice-memo-added', () => ({ VoiceMemoAddedEmail: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  generateVoiceMemoPresignedUrl,
  confirmVoiceMemoUpload,
  markVoiceMemoRead,
  getWorkoutVoiceMemos,
} from '../voice-memo-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockWorkoutFind = vi.mocked(prisma.workout.findUnique)
const mockMemoFindFirst = vi.mocked(prisma.voiceMemo.findFirst)
const mockMemoCreate = vi.mocked(prisma.voiceMemo.create)
const mockMemoUpdate = vi.mocked(prisma.voiceMemo.update)
const mockGetSignedUrl = vi.mocked(getSignedUrl)

const CLERK_ID = 'clerk_1'
const TRAINER_DB_ID = 'trainer_1'
const CLIENT_DB_ID = 'client_1'
const WORKOUT_ID = 'workout_1'
const PROGRAM_ID = 'program_1'

const dbTrainer = {
  id: TRAINER_DB_ID, clerkId: CLERK_ID, role: 'TRAINER',
  email: 'trainer@test.com', firstName: 'John', lastName: 'Doe',
}
const dbClient = {
  id: CLIENT_DB_ID, clerkId: CLERK_ID, role: 'CLIENT',
  email: 'client@test.com', firstName: 'Jane', lastName: 'Doe',
}
const workoutBase = {
  id: WORKOUT_ID, name: 'Push Day', programId: PROGRAM_ID,
  program: {
    id: PROGRAM_ID,
    trainerId: TRAINER_DB_ID,
    clientId: CLIENT_DB_ID,
    name: 'Plan A',
    trainer: { id: TRAINER_DB_ID, clerkId: CLERK_ID, email: 'trainer@test.com', firstName: 'John', lastName: 'Doe' },
    client: { id: CLIENT_DB_ID, clerkId: 'clerk_client', email: 'client@test.com', firstName: 'Jane', lastName: 'Doe' },
  },
  sessions: [],
}

beforeEach(() => vi.clearAllMocks())

describe('generateVoiceMemoPresignedUrl', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Unauthorized',
    })
  })

  it('returns Unauthorized when user not in db', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(null)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Unauthorized',
    })
  })

  it('returns Forbidden when trainer does not own workout', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      program: { ...workoutBase.program, trainerId: 'other_trainer' },
    } as never)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Forbidden',
    })
  })

  it('returns presigned URL for authorized trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutBase as never)
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/presigned')
    const result = await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')
    expect(result.success).toBe(true)
    expect(result.data?.presignedUrl).toBe('https://r2.example.com/presigned')
    expect(result.data?.pendingKey).toMatch(/^voice-memos\/pending\/.+\.webm$/)
  })

  it('returns Forbidden when client has no COMPLETED session', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      sessions: [{ clientId: CLIENT_DB_ID, status: 'IN_PROGRESS' }],
    } as never)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Forbidden',
    })
  })

  it('allows client with COMPLETED session', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      sessions: [{ clientId: CLIENT_DB_ID, status: 'COMPLETED' }],
    } as never)
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/presigned')
    const result = await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')
    expect(result.success).toBe(true)
  })
})

describe('confirmVoiceMemoUpload', () => {
  it('creates a new VoiceMemo and returns it', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutBase as never)
    mockMemoFindFirst.mockResolvedValue(null)
    const savedMemo = {
      id: 'memo_1', workoutId: WORKOUT_ID, authorId: TRAINER_DB_ID,
      authorRole: 'TRAINER', r2Key: `voice-memos/${WORKOUT_ID}/trainer_uuid.webm`,
      r2Url: `https://pub.r2.dev/voice-memos/${WORKOUT_ID}/trainer_uuid.webm`,
      durationSec: 90, isRead: false, createdAt: new Date(),
    }
    mockMemoCreate.mockResolvedValue(savedMemo as never)
    const result = await confirmVoiceMemoUpload(WORKOUT_ID, 'voice-memos/pending/550e8400-e29b-41d4-a716-446655440000.webm', 90)
    expect(result.success).toBe(true)
    expect(result.data?.authorRole).toBe('TRAINER')
    expect(result.data?.durationSec).toBe(90)
  })
})

describe('markVoiceMemoRead', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await markVoiceMemoRead('memo_1')).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('sets isRead to true', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    vi.mocked(prisma.voiceMemo.findFirst).mockResolvedValue({
      id: 'memo_1', workoutId: WORKOUT_ID, isRead: false,
      authorId: CLIENT_DB_ID, // different from TRAINER_DB_ID — trainer is the recipient
      workout: { program: { trainerId: TRAINER_DB_ID } },
    } as never)
    mockMemoUpdate.mockResolvedValue({ id: 'memo_1', isRead: true } as never)
    mockUserFind.mockResolvedValueOnce(dbTrainer as never).mockResolvedValueOnce({ clerkId: CLERK_ID } as never)
    const result = await markVoiceMemoRead('memo_1')
    expect(result.success).toBe(true)
  })

  it('returns Forbidden when author tries to mark their own memo as read', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    vi.mocked(prisma.voiceMemo.findFirst).mockResolvedValue({
      id: 'memo_1', workoutId: WORKOUT_ID, isRead: false,
      authorId: TRAINER_DB_ID, // same as user.id
      workout: { program: { trainerId: TRAINER_DB_ID } },
    } as never)
    const result = await markVoiceMemoRead('memo_1')
    expect(result).toEqual({ success: false, error: 'Forbidden' })
  })

  it('rejects a non-participant (not this program\'s trainer or client) even if not the author', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    vi.mocked(prisma.voiceMemo.findFirst).mockResolvedValue({
      id: 'memo_1', workoutId: WORKOUT_ID, isRead: false,
      authorId: CLIENT_DB_ID,
      workout: { program: { trainerId: 'someone_elses_trainer_id', clientId: 'someone_elses_client_id' } },
    } as never)
    const result = await markVoiceMemoRead('memo_1')
    expect(result).toEqual({ success: false, error: 'Forbidden' })
  })
})

describe('getWorkoutVoiceMemos', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await getWorkoutVoiceMemos(WORKOUT_ID)).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns Forbidden when user is unrelated to the workout', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      program: { trainerId: 'other_trainer', clientId: 'other_client' },
    } as never)
    expect(await getWorkoutVoiceMemos(WORKOUT_ID)).toEqual({ success: false, error: 'Forbidden' })
  })

  it('returns memos for authorized trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutBase as never)
    vi.mocked(prisma.voiceMemo.findMany).mockResolvedValue([])
    const result = await getWorkoutVoiceMemos(WORKOUT_ID)
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ trainer: null, client: null })
  })
})
