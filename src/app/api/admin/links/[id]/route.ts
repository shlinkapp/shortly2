import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, linkLog } from "@/lib/schema"
import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { createLinkLog } from "@/lib/link-logs"
import { getClientIpFromHeaders } from "@/lib/ip"
import { isRequestOriginAllowed, parseBoundedInt } from "@/lib/http"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const pageSize = parseBoundedInt(searchParams.get("pageSize"), 50, 1, 200)
  const offset = (page - 1) * pageSize

  const totalCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(linkLog)
    .where(eq(linkLog.linkId, id))
    .get()

  const logs = await db
    .select()
    .from(linkLog)
    .where(eq(linkLog.linkId, id))
    .orderBy(desc(linkLog.createdAt))
    .limit(pageSize)
    .offset(offset)

  const total = totalCount?.count ?? 0

  return NextResponse.json({
    data: logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isRequestOriginAllowed(headersList)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const { id } = await params
  const link = await db.select().from(shortLink).where(eq(shortLink.id, id)).get()
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  const ip = getClientIpFromHeaders(headersList)
  await createLinkLog({
    linkId: link.id,
    linkSlug: link.slug,
    ownerUserId: link.userId,
    eventType: "link_manual_deleted_by_admin",
    referrer: headersList.get("referer"),
    userAgent: headersList.get("user-agent"),
    ipAddress: ip,
    statusCode: 200,
  })

  await db.delete(shortLink).where(eq(shortLink.id, id))
  return NextResponse.json({ success: true })
}
