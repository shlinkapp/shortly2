import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, siteSetting } from "@/lib/schema"
import { generateSlug, isValidSlug, isValidUrl } from "@/lib/slug"
import { getClientIpFromHeaders } from "@/lib/ip"
import { checkRateLimit } from "@/lib/rate-limit"
import { createLinkLog } from "@/lib/link-logs"
import { resolvePublicAppUrl } from "@/lib/http"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

const shortenRequestSchema = z.object({
  url: z.string().min(1),
  customSlug: z.string().trim().min(1).max(50).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  maxClicks: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  await initDb()
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  const settings = await db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
  const allowAnonymous = settings?.allowAnonymous ?? true

  if (!allowAnonymous && !session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsedBody = shortenRequestSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const { url, customSlug, expiresAt, maxClicks } = parsedBody.data

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
  const creatorIp = getClientIpFromHeaders(headersList)

  const rateLimitResponse = await checkRateLimit({
    ip: creatorIp,
    userId: session?.user?.id,
    allowAnonymous,
    anonLimit: settings?.anonMaxLinksPerHour ?? 3,
    userLimit: settings?.userMaxLinksPerHour ?? 50,
  })

  if (!rateLimitResponse.success) {
    return NextResponse.json(
      { error: rateLimitResponse.error },
      { status: rateLimitResponse.status }
    )
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "This custom slug is already taken" }, { status: 409 })
    }
    throw error
  }

  await createLinkLog({
    linkId: id,
    linkSlug: slug,
    ownerUserId: session?.user?.id ?? null,
    eventType: "link_created",
    referrer: headersList.get("referer"),
    userAgent: headersList.get("user-agent"),
    ipAddress: creatorIp,
    statusCode: 201,
  })

  const appUrl = resolvePublicAppUrl(settings?.siteUrl)
  return NextResponse.json({ shortUrl: `${appUrl}/${slug}`, slug, maxClicks: finalMaxClicks })
}
