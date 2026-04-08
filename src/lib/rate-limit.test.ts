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
  it("requires authentication when user id is missing", async () => {
    const result = await checkRateLimit({
      userLimit: 10,
    })

    expect(result).toEqual({ success: false, error: "Authentication required", status: 401 })
    expect(getCalls).toBe(0)
  })

  it("treats the user limit as reached when persisted count meets the threshold", async () => {
    countResult = { count: 10 }

    const result = await checkRateLimit({
      userId: "user_123",
      userLimit: 10,
    })

    expect(result).toEqual({ success: false, error: "Rate limit exceeded. Try again later.", status: 429 })
    expect(getCalls).toBe(1)
  })

  it("allows authenticated users below their limit", async () => {
    countResult = { count: 9 }

    const result = await checkRateLimit({
      userId: "user_123",
      userLimit: 10,
    })

    expect(result).toEqual({ success: true })
    expect(getCalls).toBe(1)
  })
})
