import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"
import { shortLink } from "@/lib/schema"

type RoutePost = (typeof import("./route"))["POST"]

type SessionRecord = {
  user: {
    id: string
  }
} | null

type SiteSettingsRecord = {
  userMaxLinksPerHour?: number
  siteUrl?: string
} | null

type AllowedShortDomain = {
  host: string
} | null

type InsertedShortLink = Record<string, unknown>

let POST: RoutePost

let initDbCalls = 0
let session: SessionRecord = null
let siteSettings: SiteSettingsRecord = {
  userMaxLinksPerHour: 50,
  siteUrl: "https://app.shortly.test",
}
let originAllowed = true
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
let allowedShortDomainInputs: Array<string | undefined> = []
let originInputs: Array<{ origin: string | null; siteUrl?: string | null }> = []
let rateLimitInputs: Array<Record<string, unknown>> = []
let selfShortenInputs: Array<Record<string, unknown>> = []
let expiresInInputs: string[] = []

mock.module("next/headers", () => ({
  headers: async () =>
    new Headers({
      origin: "https://app.shortly.test",
      host: "app.shortly.test",
      referer: "https://app.shortly.test/dashboard",
      "user-agent": "TestAgent/1.0",
      "x-forwarded-for": clientIp,
    }),
}))

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => session,
    },
  },
}))

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
  isRequestOriginAllowed: (headers: Headers, siteUrl?: string | null) => {
    originInputs.push({ origin: headers.get("origin"), siteUrl })
    return originAllowed
  },
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
  return new NextRequest("https://app.shortly.test/api/shorten", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeAll(async () => {
  ;({ POST } = await import("./route"))
})

beforeEach(() => {
  initDbCalls = 0
  session = null
  siteSettings = {
    userMaxLinksPerHour: 50,
    siteUrl: "https://app.shortly.test",
  }
  originAllowed = true
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
  allowedShortDomainInputs = []
  originInputs = []
  rateLimitInputs = []
  selfShortenInputs = []
  expiresInInputs = []
})

describe("web shorten route", () => {
  it("requires authentication before creating links", async () => {
    const response = await POST(
      createRequest({
        url: "https://example.com/article",
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
    })
    expect(initDbCalls).toBe(1)
    expect(originInputs).toEqual([
      { origin: "https://app.shortly.test", siteUrl: "https://app.shortly.test" },
    ])
    expect(allowedShortDomainInputs).toHaveLength(0)
    expect(rateLimitInputs).toHaveLength(0)
    expect(insertedShortLinks).toHaveLength(0)
    expect(createLinkLogInputs).toHaveLength(0)
  })

  it("rejects forbidden origins before touching creation flow", async () => {
    originAllowed = false

    const response = await POST(
      createRequest({
        url: "https://example.com/article",
      })
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden origin",
    })
    expect(insertedShortLinks).toHaveLength(0)
    expect(rateLimitInputs).toHaveLength(0)
  })

  it("rejects invalid json bodies", async () => {
    session = {
      user: {
        id: "user_123",
      },
    }

    const response = await POST(createRequest("{"))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "无效的 JSON 主体",
    })
    expect(insertedShortLinks).toHaveLength(0)
  })

  it("creates a signed-in short link and writes a creation log", async () => {
    session = {
      user: {
        id: "user_123",
      },
    }

    const response = await POST(
      createRequest({
        url: "https://example.com/article",
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      shortUrl: "https://sho.rt/generated-slug",
      slug: "generated-slug",
      domain: "sho.rt",
      maxClicks: null,
    })
    expect(allowedShortDomainInputs).toEqual([undefined])
    expect(rateLimitInputs).toEqual([
      {
        userId: "user_123",
        userLimit: 50,
      },
    ])
    expect(selfShortenInputs).toEqual([
      {
        url: "https://example.com/article",
        host: "app.shortly.test",
        siteUrl: "https://sho.rt",
      },
    ])
    expect(insertedShortLinks).toHaveLength(1)
    expect(insertedShortLinks[0]).toMatchObject({
      userId: "user_123",
      originalUrl: "https://example.com/article",
      slug: "generated-slug",
      domain: "sho.rt",
      clicks: 0,
      creatorIp: "203.0.113.10",
      maxClicks: null,
      expiresAt: null,
    })
    expect(createLinkLogInputs).toHaveLength(1)
    expect(createLinkLogInputs[0]).toMatchObject({
      linkId: insertedShortLinks[0]?.id,
      linkSlug: "generated-slug",
      ownerUserId: "user_123",
      eventType: "link_created",
      referrer: "https://app.shortly.test/dashboard",
      userAgent: "TestAgent/1.0",
      ipAddress: "203.0.113.10",
      statusCode: 201,
    })
  })

  it("returns rate-limit errors from the shared limiter", async () => {
    session = {
      user: {
        id: "user_123",
      },
    }

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
    expect(rateLimitInputs).toEqual([
      {
        userId: "user_123",
        userLimit: 50,
      },
    ])
    expect(insertedShortLinks).toHaveLength(0)
    expect(createLinkLogInputs).toHaveLength(0)
  })

  it("lets signed-in users set custom limits and expiration", async () => {
    session = {
      user: {
        id: "user_123",
      },
    }

    const response = await POST(
      createRequest({
        url: "https://example.com/account",
        customSlug: "custom-slug",
        domain: "sho.rt",
        maxClicks: 25,
        expiresIn: "1d",
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      shortUrl: "https://sho.rt/custom-slug",
      slug: "custom-slug",
      domain: "sho.rt",
      maxClicks: 25,
    })
    expect(expiresInInputs).toEqual(["1d"])
    expect(rateLimitInputs[0]).toMatchObject({
      userId: "user_123",
      userLimit: 50,
    })
    expect(insertedShortLinks[0]).toMatchObject({
      userId: "user_123",
      slug: "custom-slug",
      maxClicks: 25,
      expiresAt: resolvedExpiresAt,
    })
    expect(createLinkLogInputs[0]).toMatchObject({
      ownerUserId: "user_123",
      linkSlug: "custom-slug",
    })
  })
})
