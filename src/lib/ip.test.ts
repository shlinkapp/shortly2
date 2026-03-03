import { describe, expect, it } from "bun:test"
import { getClientIp } from "./ip"

describe("getClientIp", () => {
  it("prefers direct ip, then x-real-ip", () => {
    expect(getClientIp("1.1.1.1", null, null)).toBe("1.1.1.1")
    expect(getClientIp(null, "2.2.2.2", "3.3.3.3")).toBe("3.3.3.3")
  })

  it("uses right-most valid x-forwarded-for value", () => {
    const chain = "203.0.113.5, 10.0.0.1, 198.51.100.7"
    expect(getClientIp(null, chain, null)).toBe("198.51.100.7")
  })

  it("respects trusted proxy hops when parsing x-forwarded-for", () => {
    const chain = "203.0.113.5, 198.51.100.10, 198.51.100.7"
    expect(getClientIp(null, chain, null, { trustedProxyHops: 2 })).toBe("198.51.100.10")
  })

  it("can ignore x-forwarded-for when not trusted", () => {
    const chain = "203.0.113.5, 198.51.100.7"
    expect(getClientIp(null, chain, null, { trustXForwardedFor: false })).toBeNull()
  })

  it("prefers cf-connecting-ip when provided", () => {
    expect(getClientIp(null, "203.0.113.5", null, { cfConnectingIp: "198.51.100.9" })).toBe("198.51.100.9")
  })

  it("uses environment TRUST_PROXY_HOPS when options are omitted", () => {
    const original = process.env.TRUST_PROXY_HOPS
    process.env.TRUST_PROXY_HOPS = "2"
    try {
      const chain = "203.0.113.5, 198.51.100.10, 198.51.100.7"
      expect(getClientIp(null, chain, null)).toBe("198.51.100.10")
    } finally {
      if (original === undefined) {
        delete process.env.TRUST_PROXY_HOPS
      } else {
        process.env.TRUST_PROXY_HOPS = original
      }
    }
  })

  it("respects environment TRUST_X_FORWARDED_FOR=false", () => {
    const original = process.env.TRUST_X_FORWARDED_FOR
    process.env.TRUST_X_FORWARDED_FOR = "false"
    try {
      const chain = "203.0.113.5, 198.51.100.7"
      expect(getClientIp(null, chain, null)).toBeNull()
    } finally {
      if (original === undefined) {
        delete process.env.TRUST_X_FORWARDED_FOR
      } else {
        process.env.TRUST_X_FORWARDED_FOR = original
      }
    }
  })

  it("returns null when no valid ip exists", () => {
    expect(getClientIp(null, "unknown", null)).toBeNull()
  })
})
