import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { parseBoundedInt } from "@/lib/http"
import { requireActiveAdmin } from "@/lib/require-user"
import { listAllTempMailboxes } from "@/lib/temp-email"

async function requireAdmin() {
  return requireActiveAdmin()
}

export async function GET(req: NextRequest) {
  await initDb()

  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit"), 20, 1, 100)
  const search = searchParams.get("search")

  const result = await listAllTempMailboxes(page, limit, search)
  return NextResponse.json(result)
}
