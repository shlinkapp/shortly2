import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"

type RouteGet = (typeof import("./route"))["GET"]

type SessionRecord = {
  user: {
    id: string
    role?: string
  }
} | null

type SelectResult = Record<string, unknown> | null

let GET: RouteGet
let session: SessionRecord = null
let initDbCalls = 0
let ownedLink: SelectResult = null
let ownedLog: SelectResult = null
let totalCount: SelectResult = { count: 2 }
let logs: Array<Record<string, unknown>> = []
let selectCall = 0
let currentSelectTable: "short_link" | "link_log" | null = null
let currentLinkLogMode: "ownership" | "list" | null = null
let totalCountMode = false

function isCountShape(shape: Record<string, unknown> | undefined) {
  return !!shape && "count" in shape
}

function isIdShape(shape: Record<string, unknown> | undefined) {
  return !!shape && Object.keys(shape).length === 1 && "id" in shape
}

function resetDbMockState() {
  selectCall = 0
  currentSelectTable = null
  currentLinkLogMode = null
  totalCountMode = false
}

function getWhereResult() {
  if (currentSelectTable === "short_link") {
    return ownedLink
  }

  if (currentSelectTable === "link_log" && totalCountMode) {
    return totalCount
  }

  if (currentSelectTable === "link_log" && currentLinkLogMode === "ownership") {
    return ownedLog
  }

  return null
}

function getOffsetResult() {
  if (currentSelectTable === "link_log" && currentLinkLogMode === "list") {
    return logs
  }

  return []
}

function getSelectGetResult() {
  if (currentSelectTable === "link_log" && totalCountMode) {
    return totalCount
  }

  return null
}

function resolveSelectMode(shape: Record<string, unknown> | undefined) {
  selectCall += 1

  if (isCountShape(shape)) {
    totalCountMode = true
    currentSelectTable = "link_log"
    currentLinkLogMode = "list"
    return
  }

  totalCountMode = false

  if (isIdShape(shape)) {
    currentSelectTable = selectCall === 1 ? "short_link" : "link_log"
    currentLinkLogMode = selectCall === 1 ? null : "ownership"
    return
  }

  currentSelectTable = "link_log"
  currentLinkLogMode = "list"
}

function createSelectChain() {
  return {
    from() {
      return {
        where() {
          return {
            get: async () => getWhereResult(),
            orderBy() {
              return {
                limit() {
                  return {
                    offset: async () => getOffsetResult(),
                  }
                },
              }
            },
          }
        },
        orderBy() {
          return {
            limit() {
              return {
                offset: async () => getOffsetResult(),
              }
            },
          }
        },
        get: async () => getSelectGetResult(),
      }
    },
  }
}

function createSelect(shape?: Record<string, unknown>) {
  resolveSelectMode(shape)
  return createSelectChain()
}

function createDbMock() {
  return {
    select(shape?: Record<string, unknown>) {
      return createSelect(shape)
    },
  }
}

const dbMock = createDbMock()

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
}))

mock.module("@/lib/db", () => ({
  initDb: async () => {
    initDbCalls += 1
  },
  db: dbMock,
}))

function createRequest() {
  return new NextRequest("https://app.shortly.test/api/logs/link_123?page=1&pageSize=50")
}

beforeAll(async () => {
  ;({ GET } = await import("./route"))
})

beforeEach(() => {
  resetDbMockState()
  session = null
  initDbCalls = 0
  ownedLink = null
  ownedLog = null
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

describe("logs route", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const response = await GET(createRequest(), {
      params: Promise.resolve({ linkId: "link_123" }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("masks sensitive fields for ordinary owners", async () => {
    session = { user: { id: "user_123", role: "user" } }
    ownedLink = { id: "link_123" }

    const response = await GET(createRequest(), {
      params: Promise.resolve({ linkId: "link_123" }),
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
    expect(body.data).toEqual([
      expect.objectContaining({
        id: "log_1",
        referrer: "https://example.com",
        userAgent: null,
        ipAddress: "203.0.113.***",
      }),
      expect.objectContaining({
        id: "log_2",
        referrer: null,
        userAgent: null,
        ipAddress: "2001:db8:***",
      }),
    ])
  })

  it("keeps full fields visible for admins", async () => {
    session = { user: { id: "admin_123", role: "admin" } }

    const response = await GET(createRequest(), {
      params: Promise.resolve({ linkId: "link_123" }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual(
      logs.map((log) => ({
        ...log,
        createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
      }))
    )
  })

  it("returns 404 when a user does not own the link or its logs", async () => {
    session = { user: { id: "user_456", role: "user" } }
    ownedLink = null
    ownedLog = null

    const response = await GET(createRequest(), {
      params: Promise.resolve({ linkId: "missing_link" }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Link not found" })
  })
})
