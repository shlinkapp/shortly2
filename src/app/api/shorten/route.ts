import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { generateSlug, isValidSlug, validateUrl } from "@/lib/slug"
import { getClientIpFromHeaders } from "@/lib/ip"
import { checkRateLimit } from "@/lib/rate-limit"
import { createLinkLog } from "@/lib/link-logs"
import { buildShortUrl, isRequestOriginAllowed, isSelfShortenTarget } from "@/lib/http"
import { SHORT_LINK_EXPIRES_IN_VALUES, resolveShortLinkExpiresAt } from "@/lib/short-link-expiration"
import { getAllowedShortDomain } from "@/lib/site-domains"
import { getSiteSettings } from "@/lib/site-settings"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

const shortenRequestSchema = z.object({
  url: z.string().min(1),
  customSlug: z.string().trim().min(1).max(50).optional(),
  domain: z.string().trim().min(1).max(255).optional(),
  expiresIn: z.enum(SHORT_LINK_EXPIRES_IN_VALUES).optional(),
  maxClicks: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  await initDb()
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  const settings = await getSiteSettings()
  const allowAnonymous = settings?.allowAnonymous ?? true

  if (!isRequestOriginAllowed(headersList, settings?.siteUrl)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  if (!allowAnonymous && !session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: "无效的 JSON 主体" }, { status: 400 })
  }
  const parsedBody = shortenRequestSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "无效的请求主体" }, { status: 400 })
  }
  const { url, customSlug, domain, expiresIn, maxClicks } = parsedBody.data

  if (!session && customSlug) {
    return NextResponse.json({ error: "自定义后缀仅对登录用户开放" }, { status: 403 })
  }

  if (!url) {
    return NextResponse.json({ error: "链接无效：链接不能为空" }, { status: 400 })
  }

  const urlValidation = validateUrl(url)
  if (!urlValidation.valid) {
    return NextResponse.json({ error: `链接无效：${urlValidation.reason}` }, { status: 400 })
  }

  const shortDomain = await getAllowedShortDomain(domain)
  if (!shortDomain) {
    return NextResponse.json({ error: "未找到可用的短链域名" }, { status: 400 })
  }

  if (isSelfShortenTarget(url, headersList, `https://${shortDomain.host}`)) {
    return NextResponse.json(
      { error: "链接无效：该链接包含本站域名，为避免循环跳转不允许缩短。" },
      { status: 400 }
    )
  }

  if (customSlug && !isValidSlug(customSlug)) {
    return NextResponse.json(
      { error: "自定义后缀无效。仅允许使用字母、数字、连字符和下划线（最多 50 个字符）。" },
      { status: 400 }
    )
  }

  const slug = customSlug || generateSlug()

  const existing = await db
    .select()
    .from(shortLink)
    .where(and(eq(shortLink.domain, shortDomain.host), eq(shortLink.slug, slug)))
    .get()
  if (existing) {
    return NextResponse.json({ error: "自定义后缀已被占用" }, { status: 409 })
  }

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

  let finalMaxClicks = null
  let finalExpiresAt = null

  if (!session) {
    finalMaxClicks = settings?.anonMaxClicks ?? 10
  } else {
    if (maxClicks && typeof maxClicks === "number" && maxClicks > 0) {
      finalMaxClicks = maxClicks
    }
    if (expiresIn) {
      finalExpiresAt = resolveShortLinkExpiresAt(expiresIn)
    }
  }

  const id = crypto.randomUUID()
  try {
    await db.insert(shortLink).values({
      id,
      userId: session?.user?.id ?? null,
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
      return NextResponse.json({ error: "自定义后缀已被占用" }, { status: 409 })
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

  return NextResponse.json({
    shortUrl: buildShortUrl(shortDomain.host, slug),
    slug,
    domain: shortDomain.host,
    maxClicks: finalMaxClicks,
  })
}
