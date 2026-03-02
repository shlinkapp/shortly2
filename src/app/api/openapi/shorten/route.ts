import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { apiKey, shortLink, siteSetting } from "@/lib/schema"
import { generateSlug, isValidSlug, isValidUrl } from "@/lib/slug"
import { getClientIp } from "@/lib/ip"
import { checkRateLimit } from "@/lib/rate-limit"
import { createLinkLog } from "@/lib/link-logs"
import { and, eq } from "drizzle-orm"
import { hashApiKey, isValidApiKeyFormat, parseApiKeyFromRequestHeaders } from "@/lib/api-keys"

export async function POST(req: NextRequest) {
  await initDb()

  const rawApiKey = parseApiKeyFromRequestHeaders(req.headers)
  if (!rawApiKey || !isValidApiKeyFormat(rawApiKey)) {
    return NextResponse.json(
      { error: "Unauthorized: missing or invalid API key format" },
      { status: 401 }
    )
  }

  const hashedKey = await hashApiKey(rawApiKey)
  const keyRecord = await db
    .select({
      id: apiKey.id,
      userId: apiKey.userId,
    })
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashedKey))
    .get()

  if (!keyRecord) {
    return NextResponse.json({ error: "Unauthorized: API key not found" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { url, customSlug, expiresAt, maxClicks } = body as {
    url?: string
    customSlug?: string
    expiresAt?: string
    maxClicks?: number
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

  const existingSlug = await db.select({ id: shortLink.id }).from(shortLink).where(eq(shortLink.slug, slug)).get()
  if (existingSlug) {
    return NextResponse.json({ error: "This custom slug is already taken" }, { status: 409 })
  }

  const settings = await db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
  const creatorIp = getClientIp(
    null,
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip")
  )
  const rateLimitResult = await checkRateLimit({
    ip: creatorIp,
    userId: keyRecord.userId,
    allowAnonymous: true,
    anonLimit: settings?.anonMaxLinksPerHour ?? 3,
    userLimit: settings?.userMaxLinksPerHour ?? 50,
  })

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: rateLimitResult.error },
      { status: rateLimitResult.status }
    )
  }

  let finalMaxClicks: number | null = null
  let finalExpiresAt: Date | null = null

  const hasMaxClicks = maxClicks !== undefined && maxClicks !== null
  if (hasMaxClicks && (typeof maxClicks !== "number" || !Number.isFinite(maxClicks) || maxClicks <= 0)) {
    return NextResponse.json({ error: "maxClicks must be a positive number" }, { status: 400 })
  }
  if (typeof maxClicks === "number" && maxClicks > 0) {
    finalMaxClicks = Math.floor(maxClicks)
  }
  if (expiresAt) {
    const parsed = new Date(expiresAt)
    if (!Number.isNaN(parsed.getTime())) {
      finalExpiresAt = parsed
    }
  }

  const id = crypto.randomUUID()

  try {
    await db.insert(shortLink).values({
      id,
      userId: keyRecord.userId,
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

  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKey.id, keyRecord.id), eq(apiKey.userId, keyRecord.userId)))

  await createLinkLog({
    linkId: id,
    linkSlug: slug,
    ownerUserId: keyRecord.userId,
    eventType: "link_created_api",
    referrer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    ipAddress: creatorIp,
    statusCode: 201,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return NextResponse.json({
    shortUrl: `${appUrl}/${slug}`,
    slug,
    maxClicks: finalMaxClicks,
  }, { status: 201 })
}
