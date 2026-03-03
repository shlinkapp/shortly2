import { describe, expect, it } from "bun:test"
import { validateUrl } from "./slug"

describe("validateUrl", () => {
  it("returns chinese reason for malformed url", () => {
    const result = validateUrl("not-a-url")
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toContain("链接格式不正确")
    }
  })

  it("returns chinese reason for unsupported protocol", () => {
    const result = validateUrl("ftp://example.com/file")
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toContain("仅支持 http:// 或 https://")
    }
  })

  it("returns chinese reason for localhost", () => {
    const result = validateUrl("http://localhost:3000/a")
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toContain("不支持本地地址")
    }
  })

  it("returns chinese reason for private ipv4", () => {
    const result = validateUrl("http://192.168.1.10/path")
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toContain("不支持内网或保留网段")
    }
  })

  it("accepts valid public http url", () => {
    expect(validateUrl("https://example.com/path?x=1").valid).toBe(true)
  })
})
