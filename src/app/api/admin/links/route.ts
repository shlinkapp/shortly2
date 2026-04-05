import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { parseBoundedInt } from "@/lib/http"
import { listAdminLinks } from "@/lib/admin-links"
import { headers } from "next/headers"

export async function GET(req: NextRequest) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limitParam = searchParams.get("limit") ?? searchParams.get("pageSize")
  const limit = parseBoundedInt(limitParam, 50, 1, 200)
  const result = await listAdminLinks(page, limit)

  return NextResponse.json(result)
}
