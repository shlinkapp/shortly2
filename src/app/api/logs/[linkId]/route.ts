import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, clickLog } from "@/lib/schema"
import { and, eq, desc, sql } from "drizzle-orm"
import { headers } from "next/headers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { linkId } = await params
  const isAdmin = (session.user as { role?: string }).role === "admin"

  const link = await db
    .select()
    .from(shortLink)
    .where(
      isAdmin
        ? eq(shortLink.id, linkId)
        : and(eq(shortLink.id, linkId), eq(shortLink.userId, session.user.id))
    )
    .get()

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  const { searchParams } = new URL(_req.url)
  const page = parseInt(searchParams.get("page") || "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10)
  const offset = (page - 1) * pageSize

  const [totalCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clickLog)
    .where(eq(clickLog.linkId, linkId))

  const logs = await db
    .select()
    .from(clickLog)
    .where(eq(clickLog.linkId, linkId))
    .orderBy(desc(clickLog.createdAt))
    .limit(pageSize)
    .offset(offset)

  return NextResponse.json({
    data: logs,
    total: totalCount.count,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount.count / pageSize)
  })
}
