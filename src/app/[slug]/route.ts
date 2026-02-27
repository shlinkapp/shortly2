import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { shortLink, clickLog } from "@/lib/schema"
import { eq, sql } from "drizzle-orm"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await initDb()
  const { slug } = await params
  const link = await db.select().from(shortLink).where(eq(shortLink.slug, slug)).get()

  if (!link) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Check if link is expired by date
  if (link.expiresAt && Date.now() > link.expiresAt.getTime()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 })
  }

  // Check if link has reached its maximum clicks
  if (link.maxClicks !== null && link.clicks >= link.maxClicks) {
    return NextResponse.json({ error: "This link has reached its maximum access count and is no longer available." }, { status: 410 })
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null

  await Promise.all([
    db
      .update(shortLink)
      .set({ clicks: sql`${shortLink.clicks} + 1` })
      .where(eq(shortLink.id, link.id)),
    db.insert(clickLog).values({
      id: crypto.randomUUID(),
      linkId: link.id,
      referrer: req.headers.get("referer"),
      userAgent: req.headers.get("user-agent"),
      ipAddress: ip,
    })
  ])

  return NextResponse.redirect(link.originalUrl, { status: 302 })
}
