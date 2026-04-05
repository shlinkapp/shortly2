import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getClientIpFromHeaders } from "@/lib/ip"
import { isRequestOriginAllowed } from "@/lib/http"
import { SHORT_LINK_EXPIRES_IN_VALUES } from "@/lib/short-link-expiration"
import { getSiteSettings } from "@/lib/site-settings"
import { createShortLink } from "@/lib/shorten"
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

  const result = await createShortLink({
    url,
    customSlug,
    domain,
    expiresIn,
    maxClicks,
    actorUserId: session?.user?.id ?? null,
    creatorIp: getClientIpFromHeaders(headersList),
    allowAnonymous,
    anonLimit: settings?.anonMaxLinksPerHour ?? 3,
    anonMaxClicks: settings?.anonMaxClicks ?? 10,
    userLimit: settings?.userMaxLinksPerHour ?? 50,
    requestHeaders: headersList,
    logEventType: "link_created",
    messages: {
      invalidUrlPrefix: "链接无效：",
      noDomainError: "未找到可用的短链域名",
      selfShortenError: "链接无效：该链接包含本站域名，为避免循环跳转不允许缩短。",
      invalidCustomSlugError: "自定义后缀无效。仅允许使用字母、数字、连字符和下划线（最多 50 个字符）。",
      duplicateSlugError: "自定义后缀已被占用",
    },
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data)
}
