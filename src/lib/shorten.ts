import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { isUniqueConstraintError } from "@/lib/db-errors"
import { revalidateShortLinkCache } from "@/lib/cache/revalidate"
import { buildShortUrl, isSelfShortenTarget } from "@/lib/http"
import { getAllowedShortDomain } from "@/lib/site-domains"
import { createLinkLog, type LinkLogEventType } from "@/lib/link-logs"
import { consumeRateLimit } from "@/lib/rate-limit"
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

  // Pre-check only custom slugs; generated slugs are checked by the unique
  // index and retried below (a collision in the ~4M generated space should not
  // surface as a "slug taken" error to a user who never picked one).
  if (input.customSlug) {
    const existingSlug = await db
      .select({ id: shortLink.id })
      .from(shortLink)
      .where(and(eq(shortLink.domain, shortDomain.host), eq(shortLink.slug, input.customSlug)))
      .get()
    if (existingSlug) {
      return { error: input.messages.duplicateSlugError, status: 409 }
    }
  }

  const rateLimitResult = await consumeRateLimit(
    `shorten:user:${input.actorUserId}`,
    input.userLimit
  )

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

  const MAX_GENERATED_SLUG_ATTEMPTS = 8
  let insertedSlug: string | null = null

  for (let attempt = 0; attempt < MAX_GENERATED_SLUG_ATTEMPTS; attempt += 1) {
    const slug = input.customSlug || generateSlug(Math.max(5, shortDomain.minSlugLength))

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
      insertedSlug = slug
      break
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }

      if (input.customSlug) {
        return { error: input.messages.duplicateSlugError, status: 409 }
      }

      // Generated slug collided: try a fresh one on the next loop iteration.
    }
  }

  if (!insertedSlug) {
    return { error: input.messages.duplicateSlugError, status: 409 }
  }

  // Clear any cached negative lookup for this slug so the new link resolves.
  revalidateShortLinkCache(shortDomain.host, insertedSlug)

  await createLinkLog({
    linkId: id,
    linkSlug: insertedSlug,
    ownerUserId: input.actorUserId,
    eventType: input.logEventType,
    referrer: input.requestHeaders.get("referer"),
    userAgent: input.requestHeaders.get("user-agent"),
    ipAddress: input.creatorIp,
    statusCode: 201,
  })

  return {
    data: {
      shortUrl: buildShortUrl(shortDomain.host, insertedSlug),
      slug: insertedSlug,
      domain: shortDomain.host,
      maxClicks: finalMaxClicks,
    },
  }
}
