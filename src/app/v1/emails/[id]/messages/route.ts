import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { parseBoundedInt } from "@/lib/http"
import { listTempMessagesForMailbox } from "@/lib/temp-email"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit") ?? searchParams.get("size"), 20, 1, 100)

  const result = await listTempMessagesForMailbox(authResult.data.userId, id, page, limit)
  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  if (!result) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 })
  }

  return NextResponse.json(result)
}
