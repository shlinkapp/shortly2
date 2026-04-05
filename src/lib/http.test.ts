import { describe, expect, it } from "bun:test"
import {
  isRequestOriginAllowed,
  isSelfShortenTarget,
  normalizeBaseUrl,
  parseBoundedInt,
  resolveCanonicalAppUrl,
} from "./http"

describe("parseBoundedInt", () => {
  it("falls back when value is invalid", () => {
    expect(parseBoundedInt(null, 10, 1, 100)).toBe(10)
    expect(parseBoundedInt("abc", 10, 1, 100)).toBe(10)
  })

  it("clamps values into bounds", () => {
    expect(parseBoundedInt("0", 10, 1, 100)).toBe(1)
    expect(parseBoundedInt("200", 10, 1, 100)).toBe(100)
    expect(parseBoundedInt("25", 10, 1, 100)).toBe(25)
  })
})

describe("normalizeBaseUrl", () => {
  it("accepts http(s) urls and trims trailing slash", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com")
    expect(normalizeBaseUrl("https://example.com/base/")).toBe("https://example.com/base")
  })

  it("rejects unsupported protocols and malformed values", () => {
    expect(normalizeBaseUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeBaseUrl("not-a-url")).toBeNull()
  })
})

describe("isRequestOriginAllowed", () => {
  it("allows requests without origin header", () => {
    const headers = new Headers()
    expect(isRequestOriginAllowed(headers, "https://short.ly")).toBe(true)
  })

  it("allows same-origin requests", () => {
    const headers = new Headers({ origin: "https://short.ly" })
    expect(isRequestOriginAllowed(headers, "https://short.ly")).toBe(true)
  })

  it("blocks cross-origin requests when known origins exist", () => {
    const headers = new Headers({ origin: "https://evil.example" })
    expect(isRequestOriginAllowed(headers, "https://short.ly")).toBe(false)
  })

  it("falls back to env origins", () => {
    const oldNextPublic = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://short.ly"
    try {
      const headers = new Headers({ origin: "https://short.ly" })
      expect(isRequestOriginAllowed(headers)).toBe(true)
    } finally {
      if (oldNextPublic === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL
      } else {
        process.env.NEXT_PUBLIC_APP_URL = oldNextPublic
      }
    }
  })
})

describe("isSelfShortenTarget", () => {
  it("blocks URLs containing NEXT_PUBLIC_APP_URL", () => {
    const oldNextPublic = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://short.ly"
    try {
      expect(isSelfShortenTarget("https://short.ly/abc")).toBe(true)
      expect(isSelfShortenTarget("https://example.com?next=https://short.ly/abc")).toBe(true)
      expect(isSelfShortenTarget("https://example.com")).toBe(false)
    } finally {
      if (oldNextPublic === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL
      } else {
        process.env.NEXT_PUBLIC_APP_URL = oldNextPublic
      }
    }
  })

  it("blocks URLs containing request host", () => {
    const headers = new Headers({ host: "short.local:3000" })
    expect(isSelfShortenTarget("https://short.local:3000/path", headers)).toBe(true)
    expect(isSelfShortenTarget("https://example.com?u=short.local:3000", headers)).toBe(true)
    expect(isSelfShortenTarget("https://example.com/path", headers)).toBe(false)
  })
})

describe("resolveCanonicalAppUrl", () => {
  it("returns NEXT_PUBLIC_APP_URL when request host uses another domain", () => {
    const oldNextPublic = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://short.ly"

    try {
      const headers = new Headers({ host: "other.example" })
      expect(resolveCanonicalAppUrl(headers)).toBe("https://short.ly")
    } finally {
      if (oldNextPublic === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL
      } else {
        process.env.NEXT_PUBLIC_APP_URL = oldNextPublic
      }
    }
  })

  it("prefers x-forwarded-host and skips redirects for the canonical hostname", () => {
    const oldNextPublic = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://short.ly"

    try {
      const headers = new Headers({
        host: "internal.proxy",
        "x-forwarded-host": "short.ly, internal.proxy",
      })
      expect(resolveCanonicalAppUrl(headers)).toBeNull()
    } finally {
      if (oldNextPublic === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL
      } else {
        process.env.NEXT_PUBLIC_APP_URL = oldNextPublic
      }
    }
  })
})
