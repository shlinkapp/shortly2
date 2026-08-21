import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { parseBoundedInt } from "@/lib/http"
import { requireActiveAdmin } from "@/lib/require-user"
import { listAdminLinks } from "@/lib/admin-links"

export async function GET(req: NextRequest) {
  await initDb()
  const session = await requireActiveAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limitParam = searchParams.get("limit") ?? searchParams.get("pageSize")
  const limit = parseBoundedInt(limitParam, 50, 1, 200)
  const result = await listAdminLinks(page, limit)

  return NextResponse.json(result)
}
