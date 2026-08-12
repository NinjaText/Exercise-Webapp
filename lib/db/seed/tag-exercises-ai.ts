import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const BATCH_SIZE = 10

interface TaggingResult {
  exerciseId: string
  indicationTags: string[]
  rehabStage: 'EARLY_REHAB' | 'MID_REHAB' | 'LATE_REHAB' | 'MAINTENANCE'
}

async function tagBatch(exercises: {
  id: string
  name: string
  description: string | null
  musclesTargeted: string[]
  contraindications: string[]
  exercisePhases: string[]
  difficultyLevel: string | null
}[]): Promise<TaggingResult[]> {
  const exerciseList = exercises
    .map(
      e =>
        `ID: ${e.id}
Name: ${e.name}
Description: ${e.description ?? 'N/A'}
Muscles: ${e.musclesTargeted.join(', ')}
Contraindications: ${e.contraindications.join(', ') || 'None'}
Phase: ${e.exercisePhases.length ? e.exercisePhases.join(', ') : 'N/A'}
Difficulty: ${e.difficultyLevel ?? 'Not set'}`
    )
    .join('\n\n---\n\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a clinical exercise classification expert. For each exercise, assign:
1. indicationTags: lowercase hyphenated clinical keywords indicating which conditions/diagnoses benefit from this exercise.
   Use tags from: ACL, knee, knee-OA, patellofemoral, meniscus, rotator-cuff, shoulder-impingement, shoulder-instability,
   post-surgical, low-back-pain, lumbar, disc, spondylosis, hip, hip-OA, THA, hip-impingement, ankle, ankle-instability,
   plantar-fasciitis, balance, proprioception, flexibility, core-stability, quad-strengthening, hamstring, glute,
   scapular-stability, cervical, general-strength, cardio. Add others as clinically appropriate.
2. rehabStage: one of EARLY_REHAB (pain control/ROM), MID_REHAB (progressive strengthening), LATE_REHAB (functional/sport), MAINTENANCE (general fitness/prevention).

Respond with JSON: { "results": [{ "exerciseId": "...", "indicationTags": [...], "rehabStage": "..." }] }`,
      },
      {
        role: 'user',
        content: `Tag these ${exercises.length} exercises:\n\n${exerciseList}`,
      },
    ],
  })

  const raw = JSON.parse(response.choices[0].message.content ?? '{}') as {
    results: TaggingResult[]
  }
  return raw.results ?? []
}

async function main() {
  console.log('Fetching all exercises...')
  const allExercises = await prisma.exercise.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      musclesTargeted: true,
      contraindications: true,
      exercisePhases: true,
      difficultyLevel: true,
    },
  })

  console.log(`Found ${allExercises.length} exercises. Tagging in batches of ${BATCH_SIZE}...`)

  let updated = 0
  let failed = 0

  for (let i = 0; i < allExercises.length; i += BATCH_SIZE) {
    const batch = allExercises.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(allExercises.length / BATCH_SIZE)
    console.log(`Batch ${batchNum}/${totalBatches}...`)

    try {
      const results = await tagBatch(batch)

      await Promise.all(
        results.map(r =>
          prisma.exercise.update({
            where: { id: r.exerciseId },
            data: {
              indicationTags: r.indicationTags,
              rehabStage: r.rehabStage,
            },
          })
        )
      )

      updated += results.length
      console.log(`  ✓ Tagged ${results.length} exercises`)
    } catch (err) {
      console.error(`  ✗ Batch ${batchNum} failed:`, err)
      failed += batch.length
    }

    // Small delay to respect rate limits
    if (i + BATCH_SIZE < allExercises.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
