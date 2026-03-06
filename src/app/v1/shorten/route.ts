import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { apiKey, shortLink, siteSetting } from "@/lib/schema"
import { generateSlug, isValidSlug, validateUrl } from "@/lib/slug"
import { getClientIpFromHeaders } from "@/lib/ip"
import { checkRateLimit } from "@/lib/rate-limit"
import { createLinkLog } from "@/lib/link-logs"
import { isSelfShortenTarget, resolvePublicAppUrl } from "@/lib/http"
import { and, eq } from "drizzle-orm"
import { hashApiKey, isValidApiKeyFormat, parseApiKeyFromRequestHeaders } from "@/lib/api-keys"
import { SHORT_LINK_EXPIRES_IN_VALUES, resolveShortLinkExpiresAt } from "@/lib/short-link-expiration"
import { z } from "zod"

const openApiShortenSchema = z.object({
  url: z.string().min(1),
  customSlug: z.string().trim().min(1).max(50).optional(),
  expiresIn: z.enum(SHORT_LINK_EXPIRES_IN_VALUES).optional(),
  maxClicks: z.number().int().positive().optional(),
})

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

  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsedBody = openApiShortenSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { url, customSlug, expiresIn, maxClicks } = parsedBody.data

  if (!url) {
    return NextResponse.json({ error: "链接无效：链接不能为空" }, { status: 400 })
  }

  const urlValidation = validateUrl(url)
  if (!urlValidation.valid) {
    return NextResponse.json({ error: `链接无效：${urlValidation.reason}` }, { status: 400 })
  }

  if (isSelfShortenTarget(url, req.headers)) {
    return NextResponse.json(
      { error: "链接无效：该链接包含本站域名（NEXT_PUBLIC_APP_URL 或当前 Host），为避免循环跳转不允许缩短。" },
      { status: 400 }
    )
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
  const creatorIp = getClientIpFromHeaders(req.headers)
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

  if (typeof maxClicks === "number" && maxClicks > 0) {
    finalMaxClicks = Math.floor(maxClicks)
  }
  if (expiresIn) {
    finalExpiresAt = resolveShortLinkExpiresAt(expiresIn)
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

  const appUrl = resolvePublicAppUrl(settings?.siteUrl)
  return NextResponse.json({
    shortUrl: `${appUrl}/${slug}`,
    slug,
    maxClicks: finalMaxClicks,
  }, { status: 201 })
}
