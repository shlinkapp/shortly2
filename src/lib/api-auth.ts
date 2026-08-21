import { and, eq, isNull, lte, or } from "drizzle-orm"
import { after } from "next/server"
import { db } from "@/lib/db"
import { reportDiagnostic } from "@/lib/observability"
import { apiKey, user } from "@/lib/schema"
import {
  API_KEY_USAGE_WRITE_INTERVAL_MS,
  hashApiKey,
  isValidApiKeyFormat,
  parseApiKeyFromRequestHeaders,
  shouldWriteApiKeyUsage,
} from "@/lib/api-keys"

export async function requireApiKeyUser(headers: Headers) {
  const rawApiKey = parseApiKeyFromRequestHeaders(headers)
  if (!rawApiKey || !isValidApiKeyFormat(rawApiKey)) {
    return { error: "Unauthorized: missing or invalid API key format" as const }
  }

  const hashedKey = await hashApiKey(rawApiKey)
  const keyRecord = await db
    .select({
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
      lastUsedAt: apiKey.lastUsedAt,
      userBanned: user.banned,
      userBanExpires: user.banExpires,
    })
    .from(apiKey)
    .innerJoin(user, eq(user.id, apiKey.userId))
    .where(eq(apiKey.keyHash, hashedKey))
    .get()

  if (!keyRecord) {
    return { error: "Unauthorized: API key not found" as const }
  }

  if (keyRecord.userBanned) {
    if (!keyRecord.userBanExpires || keyRecord.userBanExpires.getTime() > Date.now()) {
      return { error: "Forbidden: user is banned" as const }
    }

    await db
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
      .where(eq(user.id, keyRecord.userId))
  }

  return { data: keyRecord }
}

export async function touchApiKeyUsage(key: { id: string; userId: string; lastUsedAt: Date | null }) {
  const now = Date.now()
  if (!shouldWriteApiKeyUsage(key.lastUsedAt, now)) return

  const staleBefore = new Date(now - API_KEY_USAGE_WRITE_INTERVAL_MS)
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date(now) })
    .where(
      and(
        eq(apiKey.id, key.id),
        eq(apiKey.userId, key.userId),
        or(isNull(apiKey.lastUsedAt), lte(apiKey.lastUsedAt, staleBefore))
      )
    )
}

/**
 * Record API key usage after the response is sent. `last_used_at` is telemetry,
 * not part of the business result: a failure here must never turn a successful
 * create/list into a 5xx (which would cause clients to retry and duplicate
 * work).
 */
export function scheduleApiKeyUsageTouch(key: { id: string; userId: string; lastUsedAt: Date | null }) {
  const run = () =>
    touchApiKeyUsage(key).catch((error) => {
      reportDiagnostic({
        scope: "api_key",
        event: "usage_touch_failed",
        details: { keyId: key.id, userId: key.userId },
        error,
        level: "warn",
      })
    })

  try {
    after(run)
  } catch {
    // Not inside a request scope (e.g. a background worker): fall back to a
    // fire-and-forget write.
    void run()
  }
}
