import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { getLinkStatus } from "@/lib/link-status"
import { buildShortUrl, parseBoundedInt } from "@/lib/http"
import { desc, eq, sql } from "drizzle-orm"

export async function GET(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit"), 10, 1, 100)
  const offset = (page - 1) * limit

  const [totalRes, links] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(shortLink).where(eq(shortLink.userId, authResult.data.userId)).get(),
    db
      .select()
      .from(shortLink)
      .where(eq(shortLink.userId, authResult.data.userId))
      .orderBy(desc(shortLink.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  const data = links.map((link) => ({
    id: link.id,
    slug: link.slug,
    domain: link.domain,
    shortUrl: buildShortUrl(link.domain, link.slug),
    originalUrl: link.originalUrl,
    clicks: link.clicks,
    maxClicks: link.maxClicks,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
    ...getLinkStatus(link),
  }))

  const total = totalRes?.count ?? 0
  return NextResponse.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
}
