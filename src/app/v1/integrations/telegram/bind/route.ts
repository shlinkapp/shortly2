import { NextRequest, NextResponse } from "next/server"
import { initDb, db } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { telegramBinding } from "@/lib/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : ""
  const username = typeof body?.username === "string" ? body.username.trim() : null

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 })
  }

  const existing = await db
    .select({ id: telegramBinding.id })
    .from(telegramBinding)
    .where(eq(telegramBinding.userId, authResult.data.userId))
    .get()

  if (existing) {
    await db
      .update(telegramBinding)
      .set({ chatId, username, updatedAt: new Date() })
      .where(eq(telegramBinding.id, existing.id))
  } else {
    await db.insert(telegramBinding).values({
      id: crypto.randomUUID(),
      userId: authResult.data.userId,
      chatId,
      username,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  return NextResponse.json({
    success: true,
    data: {
      chatId,
      username,
    },
  })
}
