import { NextRequest, NextResponse } from "next/server"
import { initDb, db } from "@/lib/db"
import { isUniqueConstraintError } from "@/lib/db-errors"
import { requireApiKeyUser, scheduleApiKeyUsageTouch } from "@/lib/api-auth"
import { telegramBinding } from "@/lib/schema"

const CHAT_ID_PATTERN = /^[-A-Za-z0-9_@]{1,64}$/

export async function POST(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : ""
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 64) || null : null

  if (!chatId || !CHAT_ID_PATTERN.test(chatId)) {
    return NextResponse.json(
      { error: "chatId 格式无效，仅允许 1-64 位字母、数字、下划线、@ 或负号" },
      { status: 400 }
    )
  }

  try {
    // Atomic upsert on the per-user unique index: concurrent bind requests can
    // no longer race read-then-insert into a 500.
    await db
      .insert(telegramBinding)
      .values({
        id: crypto.randomUUID(),
        userId: authResult.data.userId,
        chatId,
        username,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: telegramBinding.userId,
        set: { chatId, username, updatedAt: new Date() },
      })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "该 chatId 已被其他账号绑定，请更换后重试" },
        { status: 409 }
      )
    }
    throw error
  }

  scheduleApiKeyUsageTouch(authResult.data)

  return NextResponse.json({
    success: true,
    data: {
      chatId,
      username,
    },
  })
}
