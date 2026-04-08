import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { getClientIpFromHeaders } from "@/lib/ip"
import { SHORT_LINK_EXPIRES_IN_VALUES } from "@/lib/short-link-expiration"
import { z } from "zod"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { getSiteSettings } from "@/lib/site-settings"
import { createShortLink } from "@/lib/shorten"

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

  const result = await createShortLink({
    url,
    customSlug,
    domain,
    expiresIn,
    maxClicks,
    actorUserId: authResult.data.userId,
    creatorIp: getClientIpFromHeaders(req.headers),
    userLimit: settings?.userMaxLinksPerHour ?? 50,
    requestHeaders: req.headers,
    logEventType: "link_created_api",
    messages: {
      invalidUrlPrefix: "链接无效：",
      noDomainError: "No enabled short-link domain is available",
      selfShortenError: "链接无效：该链接包含本站域名（NEXT_PUBLIC_APP_URL 或当前 Host），为避免循环跳转不允许缩短。",
      invalidCustomSlugError: "Invalid custom slug. Use only letters, numbers, hyphens, and underscores (max 50 chars).",
      duplicateSlugError: "This custom slug is already taken",
    },
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  return NextResponse.json(result.data, { status: 201 })
}
