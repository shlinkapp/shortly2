import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, user } from "@/lib/schema"
import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"

export async function GET(req: NextRequest) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get("page") || "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10)
  const offset = (page - 1) * pageSize

  const [totalCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shortLink)

  const links = await db
    .select({
      id: shortLink.id,
      userId: shortLink.userId,
      userName: user.name,
      userEmail: user.email,
      originalUrl: shortLink.originalUrl,
      slug: shortLink.slug,
      clicks: shortLink.clicks,
      createdAt: shortLink.createdAt,
    })
    .from(shortLink)
    .leftJoin(user, eq(shortLink.userId, user.id))
    .orderBy(desc(shortLink.createdAt))
    .limit(pageSize)
    .offset(offset)

  return NextResponse.json({
    data: links,
    total: totalCount.count,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount.count / pageSize)
  })
}
