import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { parseBoundedInt } from "@/lib/http"
import { listLinksForUser } from "@/lib/links"
import { requireActiveUser } from "@/lib/require-user"

export async function GET(req: NextRequest) {
  await initDb()
  const session = await requireActiveUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit"), 10, 1, 100)
  const result = await listLinksForUser(session.user.id, page, limit)

  return NextResponse.json(result)
}
