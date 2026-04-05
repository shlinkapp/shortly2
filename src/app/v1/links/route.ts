import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { parseBoundedInt } from "@/lib/http"
import { listLinksForUser } from "@/lib/links"

export async function GET(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit"), 10, 1, 100)
  const result = await listLinksForUser(authResult.data.userId, page, limit)

  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  return NextResponse.json(result)
}
