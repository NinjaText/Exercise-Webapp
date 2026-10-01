import { activeUserOnly } from "@/lib/auth/active-user"
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }))
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 401 })

  const params = new URLSearchParams(await req.text())
  const socketId = params.get('socket_id')!
  const channelName = params.get('channel_name')!

  let presenceData: { user_id: string; user_info: object } | undefined

  if (channelName.startsWith('private-thread-')) {
    // Channel format: private-thread-{idA}-{idB} (IDs sorted, both are 24-char ObjectIds)
    if (!channelName.includes(dbUser.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (channelName.startsWith('presence-inbox-')) {
    // Any authenticated user may subscribe (enables online dots for contacts)
    presenceData = {
      user_id: dbUser.id,
      user_info: {
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        imageUrl: dbUser.imageUrl,
      },
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData)
  return NextResponse.json(authResponse)
}
