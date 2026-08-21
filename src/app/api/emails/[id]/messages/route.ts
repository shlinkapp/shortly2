import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { parseBoundedInt } from "@/lib/http"
import { requireActiveUser } from "@/lib/require-user"
import { listTempMessagesForMailbox } from "@/lib/temp-email"

async function requireUser() {
  const session = await requireActiveUser()
  if (!session) {
    return null
  }
  return session.user
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit") ?? searchParams.get("size"), 20, 1, 100)

  const result = await listTempMessagesForMailbox(user.id, id, page, limit)
  if (!result) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 })
  }

  return NextResponse.json(result)
}
