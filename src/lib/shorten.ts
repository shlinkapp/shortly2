import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { buildShortUrl, isSelfShortenTarget } from "@/lib/http"
import { getAllowedShortDomain } from "@/lib/site-domains"
import { createLinkLog, type LinkLogEventType } from "@/lib/link-logs"
import { checkRateLimit } from "@/lib/rate-limit"
import { shortLink } from "@/lib/schema"
import {
  resolveShortLinkExpiresAt,
  type ShortLinkExpiresIn,
} from "@/lib/short-link-expiration"
import { generateSlug, isValidSlug, validateUrl } from "@/lib/slug"

type CreateShortLinkMessages = {
  invalidUrlPrefix: string
  noDomainError: string
  selfShortenError: string
  invalidCustomSlugError: string
  duplicateSlugError: string
}

type CreateShortLinkInput = {
  url: string
  customSlug?: string
  domain?: string
  expiresIn?: ShortLinkExpiresIn
  maxClicks?: number
  actorUserId: string
  creatorIp: string | null
  userLimit: number
  requestHeaders: Headers
  logEventType: LinkLogEventType
  messages: CreateShortLinkMessages
}

type CreateShortLinkSuccess = {
  data: {
    shortUrl: string
    slug: string
    domain: string
    maxClicks: number | null
  }
}

type CreateShortLinkFailure = {
  error: string
  status: number
}

type CreateShortLinkResult = CreateShortLinkSuccess | CreateShortLinkFailure

export async function createShortLink(
  input: CreateShortLinkInput
): Promise<CreateShortLinkResult> {
  const urlValidation = validateUrl(input.url)
  if (!urlValidation.valid) {
    return {
      error: `${input.messages.invalidUrlPrefix}${urlValidation.reason}`,
      status: 400,
    }
  }

  const shortDomain = await getAllowedShortDomain(input.domain)
  if (!shortDomain) {
    return { error: input.messages.noDomainError, status: 400 }
  }

  if (isSelfShortenTarget(input.url, input.requestHeaders, `https://${shortDomain.host}`)) {
    return { error: input.messages.selfShortenError, status: 400 }
  }

  if (input.customSlug && !isValidSlug(input.customSlug)) {
    return { error: input.messages.invalidCustomSlugError, status: 400 }
  }

  if (input.customSlug && input.customSlug.length < shortDomain.minSlugLength) {
    return { error: `自定义后缀至少需要 ${shortDomain.minSlugLength} 个字符`, status: 400 }
  }

  const slug = input.customSlug || generateSlug(Math.max(5, shortDomain.minSlugLength))

  const existingSlug = await db
    .select({ id: shortLink.id })
    .from(shortLink)
    .where(and(eq(shortLink.domain, shortDomain.host), eq(shortLink.slug, slug)))
    .get()
  if (existingSlug) {
    return { error: input.messages.duplicateSlugError, status: 409 }
  }

  const rateLimitResult = await checkRateLimit({
    userId: input.actorUserId,
    userLimit: input.userLimit,
  })

  if (!rateLimitResult.success) {
    const failure: CreateShortLinkFailure = {
      error: rateLimitResult.error,
      status: rateLimitResult.status,
    }

    return failure
  }

  const finalMaxClicks = typeof input.maxClicks === "number" && input.maxClicks > 0
    ? Math.floor(input.maxClicks)
    : null
  const finalExpiresAt = input.expiresIn
    ? resolveShortLinkExpiresAt(input.expiresIn)
    : null

  const id = crypto.randomUUID()

  try {
    await db.insert(shortLink).values({
      id,
      userId: input.actorUserId,
      originalUrl: input.url,
      slug,
      domain: shortDomain.host,
      clicks: 0,
      creatorIp: input.creatorIp,
      maxClicks: finalMaxClicks,
      expiresAt: finalExpiresAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("UNIQUE")) {
      return { error: input.messages.duplicateSlugError, status: 409 }
    }

    throw error
  }

  await createLinkLog({
    linkId: id,
    linkSlug: slug,
    ownerUserId: input.actorUserId,
    eventType: input.logEventType,
    referrer: input.requestHeaders.get("referer"),
    userAgent: input.requestHeaders.get("user-agent"),
    ipAddress: input.creatorIp,
    statusCode: 201,
  })

  return {
    data: {
      shortUrl: buildShortUrl(shortDomain.host, slug),
      slug,
      domain: shortDomain.host,
      maxClicks: finalMaxClicks,
    },
  }
}
