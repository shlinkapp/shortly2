import { describe, expect, it } from "bun:test"
import {
  COMMON_EMAIL_FIRST_NAMES,
  COMMON_EMAIL_LAST_NAMES,
  generateRandomEmailPrefix,
} from "./random-email-prefix"

describe("generateRandomEmailPrefix", () => {
  it("keeps at least 100 common first names and last names", () => {
    expect(COMMON_EMAIL_FIRST_NAMES.length).toBeGreaterThanOrEqual(100)
    expect(COMMON_EMAIL_LAST_NAMES.length).toBeGreaterThanOrEqual(100)
  })

  it("generates firstname-lastname plus three digits", () => {
    expect(generateRandomEmailPrefix(() => 0)).toBe("james-smith000")
    expect(generateRandomEmailPrefix(() => 0.9999)).toBe("evelyn-graham999")
  })

  it("uses only valid temp-email local-part characters", () => {
    for (let index = 0; index < 25; index += 1) {
      expect(generateRandomEmailPrefix()).toMatch(/^[a-z]+-[a-z]+[0-9]{3}$/)
    }
  })
})
