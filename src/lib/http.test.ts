import { describe, expect, it } from "bun:test"
import { normalizeBaseUrl, parseBoundedInt } from "./http"

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
