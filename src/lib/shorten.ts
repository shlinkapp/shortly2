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
  actorUserId: string | null
  creatorIp: string | null
  allowAnonymous: boolean
  anonLimit: number
  anonMaxClicks: number
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

  const slug = input.customSlug || generateSlug()

  const existingSlug = await db
    .select({ id: shortLink.id })
    .from(shortLink)
    .where(and(eq(shortLink.domain, shortDomain.host), eq(shortLink.slug, slug)))
    .get()
  if (existingSlug) {
    return { error: input.messages.duplicateSlugError, status: 409 }
  }

  const rateLimitResult = await checkRateLimit({
    ip: input.creatorIp,
    userId: input.actorUserId ?? undefined,
    allowAnonymous: input.allowAnonymous,
    anonLimit: input.anonLimit,
    userLimit: input.userLimit,
  })

  if (!rateLimitResult.success) {
    const failure: CreateShortLinkFailure = {
      error: rateLimitResult.error,
      status: rateLimitResult.status,
    }

    return failure
  }

  const finalMaxClicks = input.actorUserId
    ? typeof input.maxClicks === "number" && input.maxClicks > 0
      ? Math.floor(input.maxClicks)
      : null
    : input.anonMaxClicks
  const finalExpiresAt = input.actorUserId && input.expiresIn
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
