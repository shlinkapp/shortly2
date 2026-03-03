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

  it("returns null when no valid ip exists", () => {
    expect(getClientIp(null, "unknown", null)).toBeNull()
  })
})
