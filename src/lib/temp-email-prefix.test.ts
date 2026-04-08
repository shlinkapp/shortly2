import { describe, expect, it } from "bun:test"
import { isBlockedTempEmailPrefix } from "./temp-email-prefix"

describe("isBlockedTempEmailPrefix", () => {
  it("blocks common reserved words", () => {
    expect(isBlockedTempEmailPrefix("admin")).toBe(true)
    expect(isBlockedTempEmailPrefix("noreply")).toBe(true)
    expect(isBlockedTempEmailPrefix("norely")).toBe(true)
    expect(isBlockedTempEmailPrefix("web")).toBe(true)
    expect(isBlockedTempEmailPrefix("webmaster")).toBe(true)
    expect(isBlockedTempEmailPrefix("support")).toBe(true)
  })

  it("blocks separator variants and numeric suffix bypass attempts", () => {
    expect(isBlockedTempEmailPrefix("no.reply")).toBe(true)
    expect(isBlockedTempEmailPrefix("no_reply")).toBe(true)
    expect(isBlockedTempEmailPrefix("no-reply")).toBe(true)
    expect(isBlockedTempEmailPrefix("admin123")).toBe(true)
    expect(isBlockedTempEmailPrefix("web_001")).toBe(true)
  })

  it("keeps normal user prefixes available", () => {
    expect(isBlockedTempEmailPrefix("jake")).toBe(false)
    expect(isBlockedTempEmailPrefix("webby")).toBe(false)
    expect(isBlockedTempEmailPrefix("my-admin-box")).toBe(false)
    expect(isBlockedTempEmailPrefix("alpha42")).toBe(false)
  })
})
