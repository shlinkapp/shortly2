import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"

type RouteGet = (typeof import("./route"))["GET"]

type SessionRecord = {
  user: {
    id: string
    role?: string
  }
} | null

let GET: RouteGet
let session: SessionRecord = null
let initDbCalls = 0
let totalCount: { count: number } | null = { count: 2 }
let logs: Array<Record<string, unknown>> = []
let totalCountMode = false

function resetDbMockState() {
  totalCountMode = false
}

function createSelectChain() {
  return {
    from() {
      return {
        where() {
          return {
            get: async () => (totalCountMode ? totalCount : null),
            orderBy() {
              return {
                limit() {
                  return {
                    offset: async () => logs,
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

const dbMock = {
  select(shape?: Record<string, unknown>) {
    totalCountMode = !!shape && "count" in shape
    return createSelectChain()
  },
}

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}))

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => session,
    },
  },
}))

mock.module("@/lib/http", () => ({
  parseBoundedInt: (value: string | null, fallback: number, min: number, max: number) => {
    const parsed = Number.parseInt(value ?? "", 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
  },
  isRequestOriginAllowed: () => true,
}))

mock.module("@/lib/ip", () => ({
  getClientIpFromHeaders: () => null,
}))

mock.module("@/lib/link-logs", () => ({
  createLinkLog: async () => {},
}))

mock.module("@/lib/db", () => ({
  initDb: async () => {
    initDbCalls += 1
  },
  db: dbMock,
}))

function createRequest() {
  return new NextRequest("https://app.shortly.test/api/admin/links/link_123?page=1&pageSize=50")
}

beforeAll(async () => {
  ;({ GET } = await import("./route"))
})

beforeEach(() => {
  resetDbMockState()
  session = null
  initDbCalls = 0
  totalCount = { count: 2 }
  logs = [
    {
      id: "log_1",
      linkId: "link_123",
      linkSlug: "demo",
      ownerUserId: "user_123",
      eventType: "redirect_success",
      referrer: "https://example.com/path?q=1",
      userAgent: "Mozilla/5.0 TestBrowser/1.0",
      ipAddress: "203.0.113.42",
      statusCode: 302,
      createdAt: new Date("2026-04-05T10:00:00.000Z"),
    },
    {
      id: "log_2",
      linkId: "link_123",
      linkSlug: "demo",
      ownerUserId: "user_123",
      eventType: "redirect_blocked_expired",
      referrer: null,
      userAgent: null,
      ipAddress: "2001:db8:85a3::8a2e:370:7334",
      statusCode: 410,
      createdAt: new Date("2026-04-04T10:00:00.000Z"),
    },
  ]
})

describe("admin link logs route", () => {
  it("returns 403 for non-admin requests", async () => {
    session = { user: { id: "user_123", role: "user" } }

    const response = await GET(createRequest(), {
      params: Promise.resolve({ id: "link_123" }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" })
  })

  it("returns full logs for admins", async () => {
    session = { user: { id: "admin_123", role: "admin" } }

    const response = await GET(createRequest(), {
      params: Promise.resolve({ id: "link_123" }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(initDbCalls).toBe(1)
    expect(body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    })
    expect(body.data).toEqual(
      logs.map((log) => ({
        ...log,
        createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
      }))
    )
  })
})
