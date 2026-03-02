import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, linkLog } from "@/lib/schema"
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

  if (!isAdmin) {
    const ownedLink = await db
      .select({ id: shortLink.id })
      .from(shortLink)
      .where(and(eq(shortLink.id, linkId), eq(shortLink.userId, session.user.id)))
      .get()

    if (!ownedLink) {
      const ownedLog = await db
        .select({ id: linkLog.id })
        .from(linkLog)
        .where(and(eq(linkLog.linkId, linkId), eq(linkLog.ownerUserId, session.user.id)))
        .get()

      if (!ownedLog) {
        return NextResponse.json({ error: "Link not found" }, { status: 404 })
      }
    }
  }

  const { searchParams } = new URL(_req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
  const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") || "50", 10)))
  const offset = (page - 1) * pageSize

  const totalCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(linkLog)
    .where(eq(linkLog.linkId, linkId))
    .get()

  const logs = await db
    .select()
    .from(linkLog)
    .where(eq(linkLog.linkId, linkId))
    .orderBy(desc(linkLog.createdAt))
    .limit(pageSize)
    .offset(offset)

  const total = totalCount?.count ?? 0

  return NextResponse.json({
    data: logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  })
}
