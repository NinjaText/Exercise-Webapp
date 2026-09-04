"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as messageService from "@/lib/services/message.service";
import { pusherServer } from "@/lib/pusher";
import { threadChannel } from "@/lib/pusher-channels";

/** Marks every unread thread in the trainer's Inbox as read at once. */
export async function markAllInboxReadAction() {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "TRAINER") {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    const threads = await messageService.getInboxThreads(dbUser.id, { includeInternal: true });
    const unreadSenderIds = threads.filter((t) => t.unreadCount > 0).map((t) => t.otherUser.id);

    await messageService.markAllRead(dbUser.id);

    Promise.all(
      unreadSenderIds.map((senderId) =>
        pusherServer
          .trigger(threadChannel(senderId, dbUser.id), "messages-read", { readByUserId: dbUser.id })
          .catch((err) => console.error("[pusher] messages-read trigger failed:", err)),
      ),
    ).catch(() => {});

    revalidatePath("/messages");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark all as read:", error);
    return { success: false as const, error: "Failed to mark all as read" };
  }
}
