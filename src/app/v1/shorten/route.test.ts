import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"
import { shortLink } from "@/lib/schema"

type RoutePost = (typeof import("./route"))["POST"]

type ApiAuthResult =
  | { error: string }
  | {
      data: {
        id: string
        userId: string
      }
    }

type SiteSettingsRecord = {
  userMaxLinksPerHour?: number
} | null

type AllowedShortDomain = {
  host: string
} | null

type InsertedShortLink = Record<string, unknown>

let POST: RoutePost

let initDbCalls = 0
let apiAuthResult: ApiAuthResult = {
  data: {
    id: "key_123",
    userId: "user_123",
  },
}
let siteSettings: SiteSettingsRecord = {
  userMaxLinksPerHour: 50,
}
let allowedShortDomain: AllowedShortDomain = { host: "sho.rt" }
let existingLink: Record<string, unknown> | null = null
let generatedSlug = "generated-slug"
let rateLimitResponse: Record<string, unknown> = { success: true }
let clientIp = "203.0.113.10"
let selfShortenTarget = false
let resolvedExpiresAt = new Date("2026-04-06T12:00:00.000Z")
let insertError: Error | null = null
let insertedShortLinks: InsertedShortLink[] = []
let createLinkLogInputs: Record<string, unknown>[] = []
let touchedApiKeys: Array<{ id: string; userId: string }> = []
let allowedShortDomainInputs: Array<string | undefined> = []
let rateLimitInputs: Array<Record<string, unknown>> = []
let selfShortenInputs: Array<Record<string, unknown>> = []
let expiresInInputs: string[] = []

mock.module("@/lib/db", () => ({
  initDb: async () => {
    initDbCalls += 1
  },
  db: {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                get: async () => existingLink,
              }
            },
          }
        },
      }
    },
    insert(table: unknown) {
      return {
        values: async (values: InsertedShortLink) => {
          if (table === shortLink) {
            if (insertError) {
              throw insertError
            }
            insertedShortLinks.push(values)
          }
        },
      }
    },
  },
}))

mock.module("@/lib/slug", () => ({
  generateSlug: () => generatedSlug,
  isValidSlug: (value: string) => /^[a-zA-Z0-9_-]{1,50}$/.test(value),
  validateUrl: (value: string) => {
    if (!value.trim()) {
      return { valid: false, reason: "链接不能为空" }
    }

    if (!/^https?:\/\//.test(value)) {
      return { valid: false, reason: "仅支持 http(s) 链接" }
    }

    return { valid: true }
  },
}))

mock.module("@/lib/ip", () => ({
  getClientIpFromHeaders: () => clientIp,
}))

mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async (input: Record<string, unknown>) => {
    rateLimitInputs.push(input)
    return rateLimitResponse
  },
}))

mock.module("@/lib/link-logs", () => ({
  createLinkLog: async (input: Record<string, unknown>) => {
    createLinkLogInputs.push(input)
  },
}))

mock.module("@/lib/http", () => ({
  buildShortUrl: (host: string, slug: string) => `https://${host}/${slug}`,
  isSelfShortenTarget: (url: string, headers?: Headers, siteUrl?: string | null) => {
    selfShortenInputs.push({ url, host: headers?.get("host"), siteUrl })
    return selfShortenTarget
  },
}))

mock.module("@/lib/short-link-expiration", () => ({
  SHORT_LINK_EXPIRES_IN_VALUES: ["1h", "1d", "1w", "1m", "3m", "6m", "1y"],
  resolveShortLinkExpiresAt: (value: string) => {
    expiresInInputs.push(value)
    return resolvedExpiresAt
  },
}))

mock.module("@/lib/api-auth", () => ({
  requireApiKeyUser: async () => apiAuthResult,
  touchApiKeyUsage: async (id: string, userId: string) => {
    touchedApiKeys.push({ id, userId })
  },
}))

mock.module("@/lib/site-domains", () => ({
  getAllowedShortDomain: async (value?: string) => {
    allowedShortDomainInputs.push(value)
    return allowedShortDomain
  },
  getAllowedEmailDomain: async () => null,
  parseDomainHost: (value: string) => value,
}))

mock.module("@/lib/site-settings", () => ({
  getSiteSettings: async () => siteSettings,
}))

function createRequest(body: unknown) {
  return new NextRequest("https://app.shortly.test/v1/shorten", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer shortly_test_key",
      host: "api.shortly.test",
      referer: "https://docs.shortly.test/openapi",
      "user-agent": "ApiClient/1.0",
      "x-forwarded-for": clientIp,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeAll(async () => {
  ;({ POST } = await import("./route"))
})

beforeEach(() => {
  initDbCalls = 0
  apiAuthResult = {
    data: {
      id: "key_123",
      userId: "user_123",
    },
  }
  siteSettings = {
    userMaxLinksPerHour: 50,
  }
  allowedShortDomain = { host: "sho.rt" }
  existingLink = null
  generatedSlug = "generated-slug"
  rateLimitResponse = { success: true }
  clientIp = "203.0.113.10"
  selfShortenTarget = false
  resolvedExpiresAt = new Date("2026-04-06T12:00:00.000Z")
  insertError = null
  insertedShortLinks = []
  createLinkLogInputs = []
  touchedApiKeys = []
  allowedShortDomainInputs = []
  rateLimitInputs = []
  selfShortenInputs = []
  expiresInInputs = []
})

describe("api shorten route", () => {
  it("returns 401 when api key auth fails", async () => {
    apiAuthResult = { error: "Unauthorized" }

    const response = await POST(
      createRequest({
        url: "https://example.com/article",
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    })
    expect(insertedShortLinks).toHaveLength(0)
    expect(touchedApiKeys).toHaveLength(0)
  })

  it("creates an api short link, touches key usage, and writes an api creation log", async () => {
    const response = await POST(
      createRequest({
        url: "https://example.com/article",
        customSlug: "custom-slug",
        domain: "sho.rt",
        maxClicks: 25,
        expiresIn: "1d",
      })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({
      shortUrl: "https://sho.rt/custom-slug",
      slug: "custom-slug",
      domain: "sho.rt",
      maxClicks: 25,
    })
    expect(initDbCalls).toBe(1)
    expect(allowedShortDomainInputs).toEqual(["sho.rt"])
    expect(selfShortenInputs).toEqual([
      {
        url: "https://example.com/article",
        host: "api.shortly.test",
        siteUrl: "https://sho.rt",
      },
    ])
    expect(rateLimitInputs).toEqual([
      {
        userId: "user_123",
        userLimit: 50,
      },
    ])
    expect(expiresInInputs).toEqual(["1d"])
    expect(insertedShortLinks).toHaveLength(1)
    expect(insertedShortLinks[0]).toMatchObject({
      userId: "user_123",
      originalUrl: "https://example.com/article",
      slug: "custom-slug",
      domain: "sho.rt",
      clicks: 0,
      creatorIp: "203.0.113.10",
      maxClicks: 25,
      expiresAt: resolvedExpiresAt,
    })
    expect(touchedApiKeys).toEqual([{ id: "key_123", userId: "user_123" }])
    expect(createLinkLogInputs).toHaveLength(1)
    expect(createLinkLogInputs[0]).toMatchObject({
      linkId: insertedShortLinks[0]?.id,
      linkSlug: "custom-slug",
      ownerUserId: "user_123",
      eventType: "link_created_api",
      referrer: "https://docs.shortly.test/openapi",
      userAgent: "ApiClient/1.0",
      ipAddress: "203.0.113.10",
      statusCode: 201,
    })
  })

  it("returns invalid body errors for malformed json", async () => {
    const response = await POST(createRequest("{"))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    })
    expect(insertedShortLinks).toHaveLength(0)
  })

  it("returns rate-limit errors without creating links", async () => {
    rateLimitResponse = {
      success: false,
      error: "Rate limit exceeded. Try again later.",
      status: 429,
    }

    const response = await POST(
      createRequest({
        url: "https://example.com/article",
      })
    )

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      error: "Rate limit exceeded. Try again later.",
    })
    expect(insertedShortLinks).toHaveLength(0)
    expect(touchedApiKeys).toHaveLength(0)
    expect(createLinkLogInputs).toHaveLength(0)
  })

  it("rejects invalid custom slugs", async () => {
    const response = await POST(
      createRequest({
        url: "https://example.com/article",
        customSlug: "bad slug",
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid custom slug. Use only letters, numbers, hyphens, and underscores (max 50 chars).",
    })
    expect(insertedShortLinks).toHaveLength(0)
  })
})
