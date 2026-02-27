import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { eq, desc, sql } from "drizzle-orm"
import { headers } from "next/headers"

export async function GET(req: NextRequest) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")))
  const offset = (page - 1) * limit

  const [totalRes, links] = await Promise.all([
    db.select({ count: sql<number>`count(*)` })
      .from(shortLink)
      .where(eq(shortLink.userId, session.user.id))
      .get(),
    db.select()
      .from(shortLink)
      .where(eq(shortLink.userId, session.user.id))
      .orderBy(desc(shortLink.createdAt))
      .limit(limit)
      .offset(offset)
  ])

  const total = totalRes?.count ?? 0
  const totalPages = Math.ceil(total / limit)

  return NextResponse.json({
    data: links,
    total,
    page,
    limit,
    totalPages
  })
}
