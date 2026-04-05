import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { generateSlug, isValidSlug, validateUrl } from "@/lib/slug"
import { getClientIpFromHeaders } from "@/lib/ip"
import { checkRateLimit } from "@/lib/rate-limit"
import { createLinkLog } from "@/lib/link-logs"
import { buildShortUrl, isSelfShortenTarget } from "@/lib/http"
import { SHORT_LINK_EXPIRES_IN_VALUES, resolveShortLinkExpiresAt } from "@/lib/short-link-expiration"
import { z } from "zod"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { getAllowedShortDomain } from "@/lib/site-domains"
import { getSiteSettings } from "@/lib/site-settings"
import { and, eq } from "drizzle-orm"

const openApiShortenSchema = z.object({
  url: z.string().min(1),
  customSlug: z.string().trim().min(1).max(50).optional(),
  domain: z.string().trim().min(1).max(255).optional(),
  expiresIn: z.enum(SHORT_LINK_EXPIRES_IN_VALUES).optional(),
  maxClicks: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const settings = await getSiteSettings()
  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsedBody = openApiShortenSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { url, customSlug, domain, expiresIn, maxClicks } = parsedBody.data

  if (!url) {
    return NextResponse.json({ error: "链接无效：链接不能为空" }, { status: 400 })
  }

  const urlValidation = validateUrl(url)
  if (!urlValidation.valid) {
    return NextResponse.json({ error: `链接无效：${urlValidation.reason}` }, { status: 400 })
  }

  const shortDomain = await getAllowedShortDomain(domain)
  if (!shortDomain) {
    return NextResponse.json({ error: "No enabled short-link domain is available" }, { status: 400 })
  }

  if (isSelfShortenTarget(url, req.headers, `https://${shortDomain.host}`)) {
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

  const existingSlug = await db
    .select({ id: shortLink.id })
    .from(shortLink)
    .where(and(eq(shortLink.domain, shortDomain.host), eq(shortLink.slug, slug)))
    .get()
  if (existingSlug) {
    return NextResponse.json({ error: "This custom slug is already taken" }, { status: 409 })
  }

  const creatorIp = getClientIpFromHeaders(req.headers)
  const rateLimitResult = await checkRateLimit({
    ip: creatorIp,
    userId: authResult.data.userId,
    allowAnonymous: settings?.allowAnonymous ?? true,
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
      userId: authResult.data.userId,
      originalUrl: url,
      slug,
      domain: shortDomain.host,
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

  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  await createLinkLog({
    linkId: id,
    linkSlug: slug,
    ownerUserId: authResult.data.userId,
    eventType: "link_created_api",
    referrer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    ipAddress: creatorIp,
    statusCode: 201,
  })

  return NextResponse.json({
    shortUrl: buildShortUrl(shortDomain.host, slug),
    slug,
    domain: shortDomain.host,
    maxClicks: finalMaxClicks,
  }, { status: 201 })
}
