import { describe, expect, it } from "bun:test"
import { resolveShortLinkExpiresAt } from "./short-link-expiration"

describe("resolveShortLinkExpiresAt", () => {
  it("resolves hour/day/week by duration", () => {
    const base = new Date("2026-03-06T10:00:00.000Z")

    expect(resolveShortLinkExpiresAt("1h", base).toISOString()).toBe("2026-03-06T11:00:00.000Z")
    expect(resolveShortLinkExpiresAt("1d", base).toISOString()).toBe("2026-03-07T10:00:00.000Z")
    expect(resolveShortLinkExpiresAt("1w", base).toISOString()).toBe("2026-03-13T10:00:00.000Z")
  })

  it("resolves month options using calendar month clamping", () => {
    const base = new Date("2026-01-31T08:30:00.000Z")

    expect(resolveShortLinkExpiresAt("1m", base).toISOString()).toBe("2026-02-28T08:30:00.000Z")
    expect(resolveShortLinkExpiresAt("3m", base).toISOString()).toBe("2026-04-30T08:30:00.000Z")
    expect(resolveShortLinkExpiresAt("6m", base).toISOString()).toBe("2026-07-31T08:30:00.000Z")
  })

  it("resolves one year as twelve calendar months", () => {
    const base = new Date("2024-02-29T00:00:00.000Z")
    expect(resolveShortLinkExpiresAt("1y", base).toISOString()).toBe("2025-02-28T00:00:00.000Z")
  })
})
