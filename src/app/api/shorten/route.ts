import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, siteSetting } from "@/lib/schema"
import { generateSlug, isValidSlug, isValidUrl } from "@/lib/slug"
import { getClientIp } from "@/lib/ip"
import { eq, and, isNull, sql } from "drizzle-orm"
import { headers } from "next/headers"

export async function POST(req: NextRequest) {
  await initDb()
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  const settings = await db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
  const allowAnonymous = settings?.allowAnonymous ?? true

  if (!allowAnonymous && !session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const body = await req.json()
  const { url, customSlug, expiresAt, maxClicks } = body

  if (!session && customSlug) {
    return NextResponse.json({ error: "Custom slugs are only available for logged-in users" }, { status: 403 })
  }

  if (!url || !isValidUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }

  if (customSlug && !isValidSlug(customSlug)) {
    return NextResponse.json(
      { error: "Invalid custom slug. Use only letters, numbers, hyphens, and underscores (max 50 chars)." },
      { status: 400 }
    )
  }

  const slug = customSlug || generateSlug()

  const existing = await db.select().from(shortLink).where(eq(shortLink.slug, slug)).get()
  if (existing) {
    return NextResponse.json({ error: "This custom slug is already taken" }, { status: 409 })
  }

  // --- Rate Limiting Logic ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  let creatorIp: string | null = getClientIp(
    null,
    headersList.get("x-forwarded-for"),
    headersList.get("x-real-ip")
  )

  if (!session) {
    if (creatorIp) {
      const recentLinks = await db.select({ count: sql<number>`count(*)` })
        .from(shortLink)
        .where(
          and(
            eq(shortLink.creatorIp, creatorIp),
            isNull(shortLink.userId),
            sql`${shortLink.createdAt} >= ${oneHourAgo}`
          )
        ).get()

      if (recentLinks && recentLinks.count >= (settings?.anonMaxLinksPerHour ?? 3)) {
        return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 })
      }
    }
  } else {
    const recentLinks = await db.select({ count: sql<number>`count(*)` })
      .from(shortLink)
      .where(
        and(
          eq(shortLink.userId, session.user.id),
          sql`${shortLink.createdAt} >= ${oneHourAgo}`
        )
      ).get()

    if (recentLinks && recentLinks.count >= (settings?.userMaxLinksPerHour ?? 50)) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 })
    }
  }
  // --- Rate Limiting Logic End ---

  let finalMaxClicks = null
  let finalExpiresAt = null

  if (!session) {
    finalMaxClicks = settings?.anonMaxClicks ?? 10
  } else {
    if (maxClicks && typeof maxClicks === "number" && maxClicks > 0) {
      finalMaxClicks = maxClicks
    }
    if (expiresAt) {
      const parsedDate = new Date(expiresAt)
      if (!isNaN(parsedDate.getTime())) {
        finalExpiresAt = parsedDate
      }
    }
  }

  const id = crypto.randomUUID()
  await db.insert(shortLink).values({
    id,
    userId: session?.user?.id ?? null,
    originalUrl: url,
    slug,
    clicks: 0,
    creatorIp,
    maxClicks: finalMaxClicks,
    expiresAt: finalExpiresAt,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return NextResponse.json({ shortUrl: `${appUrl}/${slug}`, slug, maxClicks: finalMaxClicks })
}
