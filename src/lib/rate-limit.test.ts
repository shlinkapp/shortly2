import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"

type CheckRateLimit = (typeof import("./rate-limit"))["checkRateLimit"]

let checkRateLimit: CheckRateLimit
let countResult: { count: number } | null = null
let getCalls = 0

const dbMock = {
  select() {
    return {
      from() {
        return {
          where() {
            return {
              get: async () => {
                getCalls += 1
                return countResult
              },
            }
          },
        }
      },
    }
  },
}

mock.module("@/lib/db", () => ({
  db: dbMock,
}))

beforeAll(async () => {
  ;({ checkRateLimit } = await import("./rate-limit"))
})

beforeEach(() => {
  countResult = { count: 0 }
  getCalls = 0
})

describe("checkRateLimit", () => {
  it("requires authentication when anonymous creation is disabled", async () => {
    const result = await checkRateLimit({
      ip: "203.0.113.10",
      allowAnonymous: false,
      anonLimit: 3,
      userLimit: 10,
    })

    expect(result).toEqual({ success: false, error: "Authentication required", status: 401 })
    expect(getCalls).toBe(0)
  })

  it("allows anonymous requests without an IP outside production", async () => {
    const oldNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "test"

    try {
      const result = await checkRateLimit({
        ip: null,
        allowAnonymous: true,
        anonLimit: 3,
        userLimit: 10,
      })

      expect(result).toEqual({ success: true })
      expect(getCalls).toBe(0)
    } finally {
      if (oldNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = oldNodeEnv
      }
    }
  })

  it("rejects anonymous requests without an IP in production", async () => {
    const oldNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"

    try {
      const result = await checkRateLimit({
        ip: null,
        allowAnonymous: true,
        anonLimit: 3,
        userLimit: 10,
      })

      expect(result).toEqual({ success: false, error: "Unable to determine client IP", status: 400 })
      expect(getCalls).toBe(0)
    } finally {
      if (oldNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = oldNodeEnv
      }
    }
  })

  it("treats the anonymous limit as reached when the persisted count meets the threshold", async () => {
    countResult = { count: 3 }

    const result = await checkRateLimit({
      ip: "203.0.113.10",
      allowAnonymous: true,
      anonLimit: 3,
      userLimit: 10,
    })

    expect(result).toEqual({ success: false, error: "Rate limit exceeded. Try again later.", status: 429 })
    expect(getCalls).toBe(1)
  })

  it("allows anonymous requests below the limit", async () => {
    countResult = { count: 2 }

    const result = await checkRateLimit({
      ip: "203.0.113.10",
      allowAnonymous: true,
      anonLimit: 3,
      userLimit: 10,
    })

    expect(result).toEqual({ success: true })
    expect(getCalls).toBe(1)
  })

  it("uses the authenticated user threshold when a user id is present", async () => {
    countResult = { count: 10 }

    const result = await checkRateLimit({
      ip: "203.0.113.10",
      userId: "user_123",
      allowAnonymous: true,
      anonLimit: 3,
      userLimit: 10,
    })

    expect(result).toEqual({ success: false, error: "Rate limit exceeded. Try again later.", status: 429 })
    expect(getCalls).toBe(1)
  })

  it("allows authenticated users below their limit", async () => {
    countResult = { count: 9 }

    const result = await checkRateLimit({
      ip: "203.0.113.10",
      userId: "user_123",
      allowAnonymous: true,
      anonLimit: 3,
      userLimit: 10,
    })

    expect(result).toEqual({ success: true })
    expect(getCalls).toBe(1)
  })
})
