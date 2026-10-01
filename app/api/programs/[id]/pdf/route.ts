import { activeUserOnly } from "@/lib/auth/active-user"
import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { ProgramDocument, buildProgramPdfSections } from '@/lib/pdf/program-document'
import { DEFAULT_DISPLAY_NAME } from '@/lib/branding/defaults'
import { fetchPdfLogo } from '@/lib/pdf/fetch-pdf-logo'
import { resolvePdfBranding } from '@/lib/pdf/pdf-branding'
import { getOrgBranding } from '@/lib/services/branding.service'
import { getOrganizationOrNull } from '@/lib/services/organization.service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }))
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      client: { select: { firstName: true, lastName: true } },
      trainer: { select: { clerkOrgId: true } },
      workouts: {
        orderBy: { orderIndex: 'asc' },
        include: {
          blocks: {
            orderBy: { orderIndex: 'asc' },
            include: {
              exercises: {
                orderBy: { orderIndex: 'asc' },
                include: {
                  exercise: { select: { name: true, equipmentRequired: true, description: true, videoUrl: true } },
                  sets: { orderBy: { orderIndex: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = program.trainerId === dbUser.id
  const isClient = program.clientId === dbUser.id
  if (!isOwner && !isClient) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientName = program.client
    ? `${program.client.firstName} ${program.client.lastName}`
    : null

  // Org name from the Organization row; logo + accent only when the trainer's
  // org has branding enabled (own R2 assets only).
  const clerkOrgId = program.trainer?.clerkOrgId ?? null
  const [org, branding] = await Promise.all([
    clerkOrgId ? getOrganizationOrNull(clerkOrgId) : Promise.resolve(null),
    getOrgBranding(clerkOrgId),
  ])
  const pdfBranding = resolvePdfBranding(org, branding)
  const logoBuffer = await fetchPdfLogo(pdfBranding.logoUrl)

  const sections = buildProgramPdfSections(
    program.workouts as unknown as Record<string, unknown>[]
  )

  const buffer = await renderToBuffer(
    React.createElement(ProgramDocument, {
      programName: program.name,
      clientName,
      organizationName: pdfBranding.organizationName ?? DEFAULT_DISPLAY_NAME,
      logoBuffer,
      accentHex: pdfBranding.accentHex,
      sections,
      equipmentRequired: program.equipmentRequired ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )

  const filename = program.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    },
  })
}
