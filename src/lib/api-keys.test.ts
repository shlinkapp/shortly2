import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { API_KEY_USAGE_WRITE_INTERVAL_MS, shouldWriteApiKeyUsage } from "./api-keys"

describe("shouldWriteApiKeyUsage", () => {
  const now = Date.UTC(2026, 7, 15)

  test("writes new and stale usage timestamps only", () => {
    assert.equal(shouldWriteApiKeyUsage(null, now), true)
    assert.equal(shouldWriteApiKeyUsage(new Date(now - API_KEY_USAGE_WRITE_INTERVAL_MS), now), true)
    assert.equal(shouldWriteApiKeyUsage(new Date(now - API_KEY_USAGE_WRITE_INTERVAL_MS + 1), now), false)
  })
})
