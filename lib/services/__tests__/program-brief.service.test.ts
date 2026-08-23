import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate, mockConvertToHtml } = vi.hoisted(() => ({ mockCreate: vi.fn(), mockConvertToHtml: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockCreate } }
    },
  }
})
vi.mock('mammoth', () => ({
  default: { convertToHtml: mockConvertToHtml },
  convertToHtml: mockConvertToHtml,
}))
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { splitIntoChunks, mergeChunkSessions, deriveCircuitsFromSessions, extractBriefMetadata, extractChunkSessions, parseProgramBrief, isExerciseTraceableInDocument, flagUntraceableExercises, dropFabricatedSessions, renumberSessions, extractProgramBriefText, parseWeekdayFromLabel } from '../program-brief.service'

function block(name: string, focusType: string, exerciseCount: number) {
  return {
    name,
    focusType,
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({ name: `${name} exercise ${i}` })),
  }
}

describe('isExerciseTraceableInDocument', () => {
  it('returns true when the exercise name appears verbatim in the source text', () => {
    expect(isExerciseTraceableInDocument('Barbell Back Squat', 'Day 1\nBarbell Back Squat 4x8\nBench Press 4x8')).toBe(true)
  })

  it('returns true for case/punctuation-insensitive matches', () => {
    expect(isExerciseTraceableInDocument('back-squat', 'Barbell Back Squat: 4 sets of 8')).toBe(true)
  })

  it('returns true when most distinctive tokens overlap even if not a verbatim substring', () => {
    expect(isExerciseTraceableInDocument('Dumbbell Bench Press', 'DB Bench Press 3x10')).toBe(true)
  })

  it('returns false when the exercise name has no meaningful overlap with the source text', () => {
    expect(isExerciseTraceableInDocument('Nordic Hamstring Curl', 'Day 1\nSquat 4x8\nBench Press 4x8')).toBe(false)
  })
})

describe('flagUntraceableExercises', () => {
  it('sets traceableInDocument per exercise based on its originating chunk text', () => {
    const blueprint = [
      {
        dayIndex: 0,
        weekIndex: 0,
        title: 'Day 1',
        sourceChunkIndex: 0,
        blocks: [
          { name: 'Main', focusType: 'FULL_BODY', exercises: [{ name: 'Squat' }, { name: 'Nordic Hamstring Curl' }] },
        ],
      },
    ]
    const chunks = ['Day 1\nSquat 4x8']

    const flagged = flagUntraceableExercises(blueprint as any, chunks)

    expect(flagged[0].blocks[0].exercises[0].traceableInDocument).toBe(true)
    expect(flagged[0].blocks[0].exercises[1].traceableInDocument).toBe(false)
  })

  it('defaults to traceable when a session has no resolvable chunk index', () => {
    const blueprint = [
      { dayIndex: 0, weekIndex: 0, title: 'Day 1', blocks: [{ name: 'Main', focusType: 'FULL_BODY', exercises: [{ name: 'Squat' }] }] },
    ]
    const flagged = flagUntraceableExercises(blueprint as any, [])
    expect(flagged[0].blocks[0].exercises[0].traceableInDocument).toBe(true)
  })
})

describe('dropFabricatedSessions', () => {
  it('drops a session where every exercise is untraceable — the extraction LLM invented it wholesale', () => {
    const blueprint = [
      {
        dayIndex: 0,
        weekIndex: 0,
        title: 'Fabricated Day',
        blocks: [
          { name: 'Warm Up', focusType: 'WARMUP', exercises: [
            { name: 'Jumping Jacks', traceableInDocument: false },
            { name: 'Arm Circles', traceableInDocument: false },
          ] },
        ],
      },
      {
        dayIndex: 1,
        weekIndex: 0,
        title: 'Real Day',
        blocks: [
          { name: 'Warm Up', focusType: 'WARMUP', exercises: [
            { name: '90/90 Hip Switch', traceableInDocument: true },
          ] },
        ],
      },
    ]

    const { sessions, warnings } = dropFabricatedSessions(blueprint as any)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe('Real Day')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Fabricated Day')
  })

  it('keeps a session where only some exercises are untraceable — normal per-exercise review, not fabrication', () => {
    const blueprint = [
      {
        dayIndex: 0,
        weekIndex: 0,
        title: 'Mostly Real Day',
        blocks: [
          { name: 'Warm Up', focusType: 'WARMUP', exercises: [
            { name: '90/90 Hip Switch', traceableInDocument: true },
            { name: 'Paraphrased Thing', traceableInDocument: false },
          ] },
        ],
      },
    ]

    const { sessions, warnings } = dropFabricatedSessions(blueprint as any)

    expect(sessions).toHaveLength(1)
    expect(warnings).toHaveLength(0)
  })
})

describe('renumberSessions', () => {
  it('re-assigns contiguous 0-based dayIndex/weekIndex after sessions were filtered out', () => {
    const blueprint = [
      { dayIndex: 3, weekIndex: 0, title: 'Real Day 1', blocks: [] },
      { dayIndex: 4, weekIndex: 0, title: 'Real Day 2', blocks: [] },
      { dayIndex: 5, weekIndex: 0, title: 'Real Day 3', blocks: [] },
      { dayIndex: 0, weekIndex: 1, title: 'Week 2 Day 1', blocks: [] },
      { dayIndex: 1, weekIndex: 1, title: 'Week 2 Day 2', blocks: [] },
    ]

    const result = renumberSessions(blueprint as any)

    expect(result.map((s) => ({ week: s.weekIndex, day: s.dayIndex, title: s.title }))).toEqual([
      { week: 0, day: 0, title: 'Real Day 1' },
      { week: 0, day: 1, title: 'Real Day 2' },
      { week: 0, day: 2, title: 'Real Day 3' },
      { week: 1, day: 0, title: 'Week 2 Day 1' },
      { week: 1, day: 1, title: 'Week 2 Day 2' },
    ])
  })
})

describe('extractProgramBriefText (docx table flattening)', () => {
  it('strips a week-by-week overview grid entirely (regression: a bare "Week 1" header cell was first mistaken for a real section boundary; after fixing that, its flattened rows were then mistaken for real training days since they read like "Tuesday: 5 mi easy"-style entries)', async () => {
    mockConvertToHtml.mockResolvedValue({
      value:
        '<p>Intro paragraph.</p>' +
        '<h1>4-Week Overview</h1>' +
        '<table>' +
        '<tr><td><p><strong>Day</strong></p></td><td><p><strong>Week 1</strong></p></td><td><p><strong>Week 2</strong></p></td></tr>' +
        '<tr><td><p>Mon</p></td><td><p>Strength A</p></td><td><p>Strength A</p></td></tr>' +
        '<tr><td><p>Tue</p></td><td><p>5 mi easy</p></td><td><p>5 mi incl. tempo</p></td></tr>' +
        '</table>' +
        '<h1>Week 1 — Final Loading Week</h1><p>Real content here.</p>',
      messages: [],
    } as any)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any)

    const text = await extractProgramBriefText('https://example.com/file.docx', 'plan.docx')

    // Neither a bare "Week 1" header cell nor a flattened summary row like
    // "Tue | 5 mi easy | 5 mi incl. tempo" should appear anywhere — the whole
    // overview grid is redundant with the real "Week 1 — Final Loading Week"
    // section that follows, and only ever confuses extraction.
    expect(text).not.toMatch(/^Week 1$/m)
    expect(text).not.toContain('Day | Week 1 | Week 2')
    expect(text).not.toContain('5 mi easy')
    expect(text).toContain('Real content here.')

    // Chunking must therefore find exactly one real boundary ("Week 1 — Final
    // Loading Week"), not treat the table's header cell as a second one.
    const boundaryPattern = /^(week|phase|month|cycle|block)\s+\d+/i
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    const boundaryCount = paragraphs.filter((p) => boundaryPattern.test(p)).length
    expect(boundaryCount).toBe(1)
  })

  it('still flattens an ordinary (non-overview) table into one line per row', async () => {
    mockConvertToHtml.mockResolvedValue({
      value:
        '<h2>Monday — Strength A</h2>' +
        '<table>' +
        '<tr><td><p><strong>Exercise</strong></p></td><td><p><strong>Sets</strong></p></td></tr>' +
        '<tr><td><p>Goblet squat</p></td><td><p>3 x 8</p></td></tr>' +
        '</table>',
      messages: [],
    } as any)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any)

    const text = await extractProgramBriefText('https://example.com/file.docx', 'plan.docx')

    expect(text).toContain('Exercise | Sets')
    expect(text).toContain('Goblet squat | 3 x 8')
  })
})

describe('splitIntoChunks', () => {
  it('returns an empty array for empty text', () => {
    expect(splitIntoChunks('')).toEqual([])
    expect(splitIntoChunks('   \n\n  ')).toEqual([])
  })

  it('splits into one chunk per "Week N" boundary when 2+ boundaries exist', () => {
    const text = [
      'Week 1',
      'Day 1: Squat 4x8',
      'Day 2: Bench 4x8',
      'Week 2',
      'Day 1: Deadlift 4x6',
      'Day 2: Row 4x8',
      'Week 3',
      'Day 1: Overhead Press 4x8',
    ].join('\n\n')

    const chunks = splitIntoChunks(text)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toContain('Week 1')
    expect(chunks[0]).not.toContain('Week 2')
    expect(chunks[1]).toContain('Week 2')
    expect(chunks[1]).not.toContain('Week 3')
    expect(chunks[2]).toContain('Week 3')
  })

  it('keeps leading metadata paragraphs (before the first boundary) as their own chunk', () => {
    const text = [
      'PROGRAM_TITLE: Offseason Strength',
      'DIFFICULTY: Advanced',
      'Week 1',
      'Day 1: Squat 4x8',
      'Week 2',
      'Day 1: Deadlift 4x6',
    ].join('\n\n')

    const chunks = splitIntoChunks(text)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toContain('PROGRAM_TITLE')
    expect(chunks[0]).not.toContain('Week 1')
    expect(chunks[1]).toContain('Week 1')
    expect(chunks[2]).toContain('Week 2')
  })

  it('falls back to size-based splitting on paragraph boundaries when no Week/Phase boundaries exist', () => {
    const paragraph = 'Day 1: Squat 4x8, Bench 4x8, Row 4x8, Curl 3x12, Plank 3x30sec'
    // Repeat until comfortably over the 8000-character ceiling.
    const paragraphs = Array.from({ length: 200 }, (_, i) => `${paragraph} (session ${i})`)
    const text = paragraphs.join('\n\n')

    const chunks = splitIntoChunks(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(8000 + paragraph.length + 20)
    }
    // No paragraph content was dropped in the split.
    const rejoined = chunks.join('\n\n')
    for (let i = 0; i < 200; i++) {
      expect(rejoined).toContain(`(session ${i})`)
    }
  })

  it('returns a single chunk for short documents with no boundaries', () => {
    const text = 'Day 1: Squat 4x8\n\nDay 2: Bench 4x8'
    expect(splitIntoChunks(text)).toEqual(['Day 1: Squat 4x8\n\nDay 2: Bench 4x8'])
  })
})

describe('parseWeekdayFromLabel', () => {
  it('resolves full weekday names case-insensitively', () => {
    expect(parseWeekdayFromLabel('Monday')).toBe(0)
    expect(parseWeekdayFromLabel('wednesday')).toBe(2)
    expect(parseWeekdayFromLabel('SUNDAY')).toBe(6)
  })

  it('resolves common abbreviations', () => {
    expect(parseWeekdayFromLabel('Mon')).toBe(0)
    expect(parseWeekdayFromLabel('Thurs')).toBe(3)
  })

  it('tolerates trailing punctuation', () => {
    expect(parseWeekdayFromLabel('Monday:')).toBe(0)
    expect(parseWeekdayFromLabel('Mon.')).toBe(0)
  })

  it('returns null for non-weekday labels', () => {
    expect(parseWeekdayFromLabel('Day 1')).toBeNull()
    expect(parseWeekdayFromLabel('Session A')).toBeNull()
    expect(parseWeekdayFromLabel(null)).toBeNull()
    expect(parseWeekdayFromLabel(undefined)).toBeNull()
  })
})

describe('mergeChunkSessions', () => {
  it('groups sessions into weeks by weekLabel continuity, not by dividing a flat count', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 1', dayLabel: 'Day 1', title: 'Lower A', blocks: [block('Warm Up', 'WARMUP', 2)] },
          { weekLabel: 'Week 1', dayLabel: 'Day 2', title: 'Upper A', blocks: [block('Warm Up', 'WARMUP', 2)] },
          { weekLabel: 'Week 2', dayLabel: 'Day 1', title: 'Lower A', blocks: [block('Warm Up', 'WARMUP', 2)] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint, daysPerWeek } = mergeChunkSessions(chunkResults, 2)

    expect(sessionBlueprint.map((s) => [s.weekIndex, s.dayIndex, s.title])).toEqual([
      [0, 0, 'Lower A'],
      [0, 1, 'Upper A'],
      [1, 0, 'Lower A'],
    ])
    expect(daysPerWeek).toBe(2)
  })

  it('carries dayLabel through onto the session blueprint (regression: it was captured by extraction but discarded during merge, so downstream day-of-week assignment could only guess from position)', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 1', dayLabel: 'Monday', title: 'Lower A', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: 'Wednesday', title: 'Upper A', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint } = mergeChunkSessions(chunkResults, 2)

    expect(sessionBlueprint.map((s) => s.dayLabel)).toEqual(['Monday', 'Wednesday'])
  })

  it('carries the last non-null weekLabel forward onto undecorated sessions', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 2', dayLabel: 'Day 1', title: 'A', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 2', title: 'B', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 3', title: 'C', blocks: [] },
          { weekLabel: 'Week 3', dayLabel: 'Day 1', title: 'D', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint } = mergeChunkSessions(chunkResults, 1)

    expect(sessionBlueprint.map((s) => s.weekIndex)).toEqual([0, 0, 0, 1])
  })

  it('treats a document with no weekLabel anywhere as a single week when total sessions fit the estimated days/week', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: null, dayLabel: 'Day 1', title: 'A', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 2', title: 'B', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 3', title: 'C', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint, daysPerWeek } = mergeChunkSessions(chunkResults, 3)

    expect(sessionBlueprint.every((s) => s.weekIndex === 0)).toBe(true)
    expect(sessionBlueprint.map((s) => s.dayIndex)).toEqual([0, 1, 2])
    expect(daysPerWeek).toBe(3)
  })

  it('splits a no-weekLabel document with more sessions than the estimated days/week into multiple weeks (regression: previously collapsed every session into one week, colliding sessions onto the same weekday)', () => {
    const titles = ['Lower A', 'Upper A', 'Full A', 'Lower B', 'Upper B', 'Full B', 'Lower A2', 'Upper A2']
    const chunkResults = [
      {
        sessions: titles.map((title) => ({ weekLabel: null, dayLabel: null, title, blocks: [] })),
        warnings: [],
      },
    ]

    const { sessionBlueprint, daysPerWeek } = mergeChunkSessions(chunkResults, 3)

    expect(daysPerWeek).toBe(3)
    expect(sessionBlueprint.map((s) => [s.weekIndex, s.dayIndex, s.title])).toEqual([
      [0, 0, 'Lower A'],
      [0, 1, 'Upper A'],
      [0, 2, 'Full A'],
      [1, 0, 'Lower B'],
      [1, 1, 'Upper B'],
      [1, 2, 'Full B'],
      [2, 0, 'Lower A2'],
      [2, 1, 'Upper A2'],
    ])
  })

  it('derives daysPerWeek as the largest week size for irregular week lengths', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 1', dayLabel: null, title: 'A', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: null, title: 'B', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: null, title: 'C', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: null, title: 'D', blocks: [] },
          { weekLabel: 'Week 2 (Deload)', dayLabel: null, title: 'E', blocks: [] },
          { weekLabel: 'Week 2 (Deload)', dayLabel: null, title: 'F', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { daysPerWeek } = mergeChunkSessions(chunkResults, 4)
    expect(daysPerWeek).toBe(4)
  })

  it('concatenates warnings across all chunks and preserves chunk order', () => {
    const chunkResults = [
      { sessions: [{ weekLabel: null, dayLabel: null, title: 'A', blocks: [] }], warnings: ['warn-1'] },
      { sessions: [{ weekLabel: null, dayLabel: null, title: 'B', blocks: [] }], warnings: ['warn-2'] },
    ]

    const { sessionBlueprint, warnings } = mergeChunkSessions(chunkResults, 7)
    expect(sessionBlueprint.map((s) => s.title)).toEqual(['A', 'B'])
    expect(warnings).toEqual(['warn-1', 'warn-2'])
  })

  it('returns an empty blueprint for a document with zero extracted sessions', () => {
    const result = mergeChunkSessions([{ sessions: [], warnings: ['nothing found'] }], 3)
    expect(result.sessionBlueprint).toEqual([])
    expect(result.daysPerWeek).toBe(1)
    expect(result.warnings).toEqual(['nothing found'])
  })
})

describe('deriveCircuitsFromSessions', () => {
  it('takes the max exercise count per block name across all sessions', () => {
    const sessions = [
      { dayIndex: 0, weekIndex: 0, title: 'A', blocks: [block('Warm Up', 'WARMUP', 3)] },
      { dayIndex: 1, weekIndex: 0, title: 'B', blocks: [block('Warm Up', 'WARMUP', 5)] },
    ]

    const circuits = deriveCircuitsFromSessions(sessions)
    expect(circuits).toHaveLength(1)
    expect(circuits[0]).toMatchObject({ name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 5 })
  })

  it('sets rounds to 1 for WARMUP/COOLDOWN and 3 for everything else', () => {
    const sessions = [
      {
        dayIndex: 0,
        weekIndex: 0,
        title: 'A',
        blocks: [block('Warm Up', 'WARMUP', 2), block('Cooldown', 'COOLDOWN', 2), block('Strength Block A', 'LOWER_BODY', 2)],
      },
    ]

    const circuits = deriveCircuitsFromSessions(sessions)
    const byName = Object.fromEntries(circuits.map((c) => [c.name, c.rounds]))
    expect(byName['Warm Up']).toBe(1)
    expect(byName['Cooldown']).toBe(1)
    expect(byName['Strength Block A']).toBe(3)
  })
})

describe('extractBriefMetadata', () => {
  it('parses the AI response and clamps durationMinutes to a sane range', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              programTitle: 'Advanced Baseball Offseason Performance Program',
              focusAreas: ['power', 'lower body'],
              difficultyLevel: 'ADVANCED',
              durationMinutes: 999,
              preferredWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
              estimatedDaysPerWeek: 4,
              inferredFields: [],
            }),
          },
        },
      ],
    })

    const metadata = await extractBriefMetadata('some document text')

    expect(metadata.programTitle).toBe('Advanced Baseball Offseason Performance Program')
    expect(metadata.difficultyLevel).toBe('ADVANCED')
    expect(metadata.preferredWeekdays).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday'])
    expect(metadata.durationMinutes).toBe(180) // clamped to the 10-180 range
    expect(metadata.estimatedDaysPerWeek).toBe(4)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    )
  })

  it('clamps estimatedDaysPerWeek to the 1-7 range and defaults to 3 when missing', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              programTitle: 'Test',
              focusAreas: [],
              difficultyLevel: 'BEGINNER',
              durationMinutes: 45,
              preferredWeekdays: ['Monday'],
              estimatedDaysPerWeek: 12,
              inferredFields: [],
            }),
          },
        },
      ],
    })
    const overshoot = await extractBriefMetadata('doc')
    expect(overshoot.estimatedDaysPerWeek).toBe(7)

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              programTitle: 'Test',
              focusAreas: [],
              difficultyLevel: 'BEGINNER',
              durationMinutes: 45,
              preferredWeekdays: ['Monday'],
              inferredFields: [],
            }),
          },
        },
      ],
    })
    const missing = await extractBriefMetadata('doc')
    expect(missing.estimatedDaysPerWeek).toBe(3)
  })

  it('passes through inferredFields so the caller can flag them', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              programTitle: 'Untitled Program',
              focusAreas: [],
              difficultyLevel: 'BEGINNER',
              durationMinutes: 45,
              preferredWeekdays: ['Monday'],
              inferredFields: ['programTitle', 'focusAreas'],
            }),
          },
        },
      ],
    })

    const metadata = await extractBriefMetadata('a document with no clear title')
    expect(metadata.inferredFields).toEqual(['programTitle', 'focusAreas'])
  })
})

describe('extractChunkSessions', () => {
  it('parses the AI response into sessions and warnings', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sessions: [
                {
                  weekLabel: 'Week 1',
                  dayLabel: 'Day 1',
                  title: 'Lower Body A – Squat & Acceleration',
                  blocks: [
                    {
                      name: 'Warm Up',
                      focusType: 'WARMUP',
                      exercises: [
                        { name: 'Dynamic Mobility', sets: null, reps: null, durationSeconds: null, notes: null },
                        { name: 'A-Skips', sets: 2, reps: 20, durationSeconds: null, notes: null },
                      ],
                    },
                  ],
                },
              ],
              warnings: [],
            }),
          },
        },
      ],
    })

    const result = await extractChunkSessions('Week 1\nDAY_1: Lower Body A...', 0, 1, null)

    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].weekLabel).toBe('Week 1')
    expect(result.sessions[0].blocks[0].exercises).toHaveLength(2)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    )
  })

  it('includes chunk position and continuity note in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ sessions: [], warnings: [] }) } }],
    })

    await extractChunkSessions('chunk text', 2, 5, "The previous chunk's last session was: Week 3, Day 2.")

    const call = mockCreate.mock.calls[0][0]
    const systemMessage = call.messages.find((m: any) => m.role === 'system').content
    expect(systemMessage).toContain('chunk 3 of 5')
    expect(systemMessage).toContain("The previous chunk's last session was: Week 3, Day 2.")
  })

  it('defaults to an empty result if the AI returns unparseable content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    const result = await extractChunkSessions('chunk text', 0, 1, null)
    expect(result).toEqual({ sessions: [], warnings: [] })
  })
})

describe('parseProgramBrief (orchestrator) — deterministic chunk weekLabel override', () => {
  it('groups all sessions from one chunk into a single week even when the extraction LLM tags weekLabel inconsistently across them (regression: inconsistent per-session weekLabel tagging fractured one real week into several phantom weeks)', async () => {
    mockCreate.mockImplementation((args: any) => {
      const userContent = args.messages[1].content as string
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            programTitle: 'Test Program', focusAreas: ['full body'], difficultyLevel: 'ADVANCED',
            durationMinutes: 45, preferredWeekdays: ['Monday', 'Tuesday', 'Wednesday'],
            estimatedDaysPerWeek: 3, inferredFields: [],
          }) } }],
        })
      }
      const weekMatch = userContent.match(/Week (\d)/)
      const week = weekMatch ? weekMatch[1] : '1'
      // Simulate the model tagging weekLabel inconsistently within the SAME
      // chunk — e.g. correctly for the strength session, but null (or a
      // stray different value) for a borderline "session" like a plain run.
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({
          sessions: [
            { weekLabel: `Week ${week}`, dayLabel: 'Monday', title: 'Strength', blocks: [{ name: 'Main', focusType: 'FULL_BODY', exercises: [{ name: 'Squat', sets: 3, reps: 8, durationSeconds: null, notes: null }] }] },
            { weekLabel: null, dayLabel: 'Tuesday', title: 'Easy Run', blocks: [{ name: 'Run', focusType: 'CARDIO', exercises: [{ name: '5 miles easy', sets: null, reps: null, durationSeconds: null, notes: null }] }] },
          ],
          warnings: [],
        }) } }],
      })
    })

    const text = [
      'Week 1', 'DAY_1: Strength\nSquat - 3x8\nDAY_2: 5 miles easy',
      'Week 2', 'DAY_1: Strength\nSquat - 3x8\nDAY_2: 5 miles easy',
    ].join('\n\n')

    const result = await parseProgramBrief(text)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    // 2 real weeks (from the 2 chunks), 2 sessions each — NOT 3-4 phantom
    // weeks from the null-tagged "Easy Run" session drifting to its own group.
    expect(new Set(result.data.sessionBlueprint!.map((s) => s.weekIndex))).toEqual(new Set([0, 1]))
    expect(result.data.sessionBlueprint).toHaveLength(4)
  })
})

describe('parseProgramBrief (orchestrator)', () => {
  it('uses a provided metadataOverride instead of re-calling the metadata AI pass, and treats confirmed schedule fields as no longer inferred', async () => {
    // Only the chunk-extraction schema should ever be requested — if the
    // orchestrator ignored the override and called extractBriefMetadata
    // internally, this mock would receive a 'brief_metadata' request too
    // and the assertion below on call count would fail.
    mockCreate.mockImplementation((args: any) => {
      expect(args.response_format.json_schema.name).toBe('chunk_extraction')
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: [
                  { weekLabel: null, dayLabel: null, title: 'Full Body A', blocks: [] },
                  { weekLabel: null, dayLabel: null, title: 'Full Body B', blocks: [] },
                ],
                warnings: [],
              }),
            },
          },
        ],
      })
    })

    const confirmedMetadata = {
      programTitle: 'Trainer-Confirmed Program',
      focusAreas: ['full body'],
      difficultyLevel: 'INTERMEDIATE',
      durationMinutes: 45,
      preferredWeekdays: ['Tuesday', 'Thursday'],
      estimatedDaysPerWeek: 2,
      inferredFields: ['preferredWeekdays', 'estimatedDaysPerWeek'],
    }

    const result = await parseProgramBrief('Full Body A\n\nFull Body B', confirmedMetadata)

    expect(mockCreate).toHaveBeenCalledTimes(1) // only the chunk-extraction call, no metadata call
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.data.programTitle).toBe('Trainer-Confirmed Program')
    expect(result.data.preferredWeekdays).toEqual(['Tuesday', 'Thursday'])
    expect(result.data.daysPerWeek).toBe(2)
    // The caller (actions/program-actions.ts) is expected to strip confirmed
    // schedule fields out of inferredFields before passing the override in —
    // parseProgramBrief just passes whatever it's given straight through.
    expect(result.data.inferredFields).toEqual(['preferredWeekdays', 'estimatedDaysPerWeek'])
  })

  it('produces a 4-week sessionBlueprint from a document split into 4 week chunks', async () => {
    mockCreate.mockImplementation((args: any) => {
      const userContent = args.messages[1].content as string
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Advanced Baseball Offseason Performance Program',
                  focusAreas: ['power', 'lower body'],
                  difficultyLevel: 'ADVANCED',
                  durationMinutes: 90,
                  preferredWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
                  inferredFields: [],
                }),
              },
            },
          ],
        })
      }
      // chunk extraction — one session per chunk, using the week number embedded in the chunk text
      const weekMatch = userContent.match(/Week (\d)/)
      const week = weekMatch ? weekMatch[1] : '1'
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: [
                  {
                    weekLabel: `Week ${week}`,
                    dayLabel: 'Day 1',
                    title: 'Lower Body A',
                    blocks: [
                      {
                        name: 'Warm Up',
                        focusType: 'WARMUP',
                        exercises: [{ name: 'Squat', sets: 4, reps: 8, durationSeconds: null, notes: null }],
                      },
                    ],
                  },
                  {
                    weekLabel: `Week ${week}`,
                    dayLabel: 'Day 2',
                    title: 'Upper Body A',
                    blocks: [
                      {
                        name: 'Warm Up',
                        focusType: 'WARMUP',
                        exercises: [{ name: 'Bench Press', sets: 4, reps: 8, durationSeconds: null, notes: null }],
                      },
                    ],
                  },
                ],
                warnings: [],
              }),
            },
          },
        ],
      })
    })

    const text = [
      'Week 1',
      'DAY_1: Lower Body A\nSquat - 4x8\nBench Press - 4x8',
      'Week 2',
      'DAY_1: Lower Body A\nSquat - 4x8\nBench Press - 4x8',
      'Week 3',
      'DAY_1: Lower Body A\nSquat - 4x8\nBench Press - 4x8',
      'Week 4',
      'DAY_1: Lower Body A\nSquat - 4x8\nBench Press - 4x8',
    ].join('\n\n')

    const result = await parseProgramBrief(text)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.data.sessionBlueprint).toHaveLength(8)
    expect(result.data.daysPerWeek).toBe(2)
    expect(new Set(result.data.sessionBlueprint!.map((s) => s.weekIndex))).toEqual(new Set([0, 1, 2, 3]))
    expect(result.data.circuits).toEqual([
      { name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 1, rounds: 1 },
    ])
  })

  it('surfaces chunk warnings and exposes inferredFields separately for the UI to highlight editable fields', async () => {
    mockCreate.mockImplementation((args: any) => {
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Untitled Program',
                  focusAreas: ['general fitness'],
                  difficultyLevel: 'BEGINNER',
                  durationMinutes: 45,
                  preferredWeekdays: ['Monday'],
                  inferredFields: ['programTitle', 'difficultyLevel'],
                }),
              },
            },
          ],
        })
      }
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: [
                  { weekLabel: null, dayLabel: null, title: 'Full Body', blocks: [] },
                ],
                warnings: ['Day had no explicit block labels; grouped as one block'],
              }),
            },
          },
        ],
      })
    })

    const result = await parseProgramBrief('a loosely structured single-day plan')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.data.warnings).toEqual(['Day had no explicit block labels; grouped as one block'])
    expect(result.data.inferredFields).toEqual(['programTitle', 'difficultyLevel'])
  })

  it('returns an error result when the document is empty', async () => {
    const result = await parseProgramBrief('   ')
    expect(result.ok).toBe(false)
  })

  it('returns an error result when zero sessions can be extracted', async () => {
    mockCreate.mockImplementation((args: any) => {
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Empty',
                  focusAreas: [],
                  difficultyLevel: 'BEGINNER',
                  durationMinutes: 30,
                  preferredWeekdays: ['Monday'],
                  inferredFields: [],
                }),
              },
            },
          ],
        })
      }
      return Promise.resolve({ choices: [{ message: { content: JSON.stringify({ sessions: [], warnings: [] }) } }] })
    })

    const result = await parseProgramBrief('completely unrelated content with no sessions')
    expect(result.ok).toBe(false)
  })

  it('splits a no-weekLabel document into multiple weeks using the estimated days/week, instead of collapsing everything into one week (regression)', async () => {
    const sessionTitles = [
      'Lower body A', 'Upper body A', 'Full body A',
      'Lower body B', 'Upper body B', 'Full body B',
      'Lower body A (hinge focus)', 'Upper body A (push focus)',
    ]
    mockCreate.mockImplementation((args: any) => {
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Cyclic Program',
                  focusAreas: ['full body'],
                  difficultyLevel: 'ADVANCED',
                  durationMinutes: 60,
                  preferredWeekdays: ['Monday', 'Wednesday', 'Friday'],
                  estimatedDaysPerWeek: 3,
                  inferredFields: [],
                }),
              },
            },
          ],
        })
      }
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: sessionTitles.map((title) => ({
                  weekLabel: null,
                  dayLabel: null,
                  title,
                  blocks: [{ name: 'Warm Up', focusType: 'WARMUP', exercises: [{ name: 'Squat', sets: 4, reps: 8, durationSeconds: null, notes: null }] }],
                })),
                warnings: [],
              }),
            },
          },
        ],
      })
    })

    const result = await parseProgramBrief(sessionTitles.map((t) => `${t}\nSquat - 4x8`).join('\n\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.data.daysPerWeek).toBe(3)
    expect(result.data.preferredWeekdays).toEqual(['Monday', 'Wednesday', 'Friday'])
    expect(new Set(result.data.sessionBlueprint!.map((s) => s.weekIndex))).toEqual(new Set([0, 1, 2]))
    // Every (week, day) slot must be unique — no two sessions collided onto the same slot.
    const slots = result.data.sessionBlueprint!.map((s) => `${s.weekIndex}_${s.dayIndex}`)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('drops a phantom session fabricated from a front-matter/preamble chunk instead of merging it in as a real day (regression: a title/equipment/"each session has N exercises" chunk with no real exercises was being turned into a fake extra day)', async () => {
    mockCreate.mockImplementation((args: any) => {
      const userContent = args.messages[1].content as string
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Advanced Tennis Program',
                  focusAreas: ['power', 'mobility'],
                  difficultyLevel: 'ADVANCED',
                  durationMinutes: 60,
                  preferredWeekdays: ['Monday', 'Wednesday', 'Friday'],
                  estimatedDaysPerWeek: 3,
                  inferredFields: [],
                }),
              },
            },
          ],
        })
      }
      // The preamble chunk (no "Week" label, no real exercises) — simulates the LLM
      // hallucinating a full fake session instead of returning sessions: [].
      if (userContent.includes('Each session: 4-exercise warm-up')) {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sessions: [
                    {
                      weekLabel: 'Week 1',
                      dayLabel: 'Day 1',
                      title: 'Fabricated Session',
                      blocks: [
                        {
                          name: 'Warm Up',
                          focusType: 'WARMUP',
                          exercises: [{ name: 'Jumping Jacks', sets: 1, reps: 20, durationSeconds: null, notes: null }],
                        },
                      ],
                    },
                  ],
                  warnings: [],
                }),
              },
            },
          ],
        })
      }
      // The real "Week N" chunks — genuine exercises that appear verbatim in the chunk text.
      const weekMatch = userContent.match(/Week (\d)/)
      const week = weekMatch ? weekMatch[1] : '1'
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: [
                  {
                    weekLabel: `Week ${week}`,
                    dayLabel: 'Day 1',
                    title: 'Lower Body',
                    blocks: [
                      {
                        name: 'Warm Up',
                        focusType: 'WARMUP',
                        exercises: [{ name: '90/90 Hip Switch', sets: null, reps: 8, durationSeconds: null, notes: null }],
                      },
                    ],
                  },
                ],
                warnings: [],
              }),
            },
          },
        ],
      })
    })

    const text = [
      'Advanced Tennis Program',
      'Each session: 4-exercise warm-up • 4-exercise main circuit × 3 sets • 3-exercise cool-down',
      'Week 1',
      '90/90 Hip Switch - 8/side',
      'Week 2',
      '90/90 Hip Switch - 8/side',
    ].join('\n\n')

    const result = await parseProgramBrief(text)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    // The fabricated session must not survive into the blueprint.
    expect(result.data.sessionBlueprint!.some((s) => s.title === 'Fabricated Session')).toBe(false)
    expect(result.data.sessionBlueprint!.some((s) => s.blocks.some((b) => b.exercises.some((e) => e.name === 'Jumping Jacks')))).toBe(false)
    // Only the two genuine week sessions remain, correctly numbered.
    expect(result.data.sessionBlueprint).toHaveLength(2)
    expect(new Set(result.data.sessionBlueprint!.map((s) => s.weekIndex))).toEqual(new Set([0, 1]))
    expect(result.data.sessionBlueprint!.every((s) => s.dayIndex === 0)).toBe(true)
    expect(result.data.warnings!.some((w) => w.includes('Fabricated Session'))).toBe(true)
  })
})
