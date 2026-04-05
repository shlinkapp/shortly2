import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, linkLog } from "@/lib/schema"
import { parseBoundedInt } from "@/lib/http"
import { and, eq, desc, sql } from "drizzle-orm"
import { headers } from "next/headers"

function maskIpAddress(ipAddress: string | null) {
  if (!ipAddress) {
    return null
  }

  if (ipAddress.includes(".")) {
    const parts = ipAddress.split(".")
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`
    }
  }

  if (ipAddress.includes(":")) {
    const parts = ipAddress.split(":").filter(Boolean)
    if (parts.length > 0) {
      return `${parts.slice(0, 2).join(":")}:***`
    }
  }

  return "***"
}

function sanitizeReferrer(referrer: string | null) {
  if (!referrer) {
    return null
  }

  try {
    const url = new URL(referrer)
    return url.origin
  } catch {
    return null
  }
}

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
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const pageSize = parseBoundedInt(searchParams.get("pageSize"), 50, 1, 200)
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
  const data = isAdmin
    ? logs
    : logs.map((log) => ({
        ...log,
        referrer: sanitizeReferrer(log.referrer),
        userAgent: null,
        ipAddress: maskIpAddress(log.ipAddress),
      }))

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  })
}
