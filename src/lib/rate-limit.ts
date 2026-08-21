import { and, eq, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { rateLimitWindow } from "@/lib/schema"

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60
// Keep expired windows around briefly so late-arriving requests still hit the
// same window they incremented, then sweep them on the next write.
const RATE_LIMIT_RETENTION_SECONDS = RATE_LIMIT_WINDOW_SECONDS * 2

export type RateLimitResult =
  | { success: true; remaining: number }
  | { success: false; error: string; status: number }

/**
 * Fixed-window rate limit backed by an atomic upsert on
 * `rate_limit_window(key, window_start)`.
 *
 * Unlike counting rows (a "soft" limit that concurrent requests can all pass
 * before any insert is visible), the counter is incremented and read inside a
 * single SQLite upsert, so N parallel requests can never collectively exceed
 * the limit by more than one (the request that crosses the threshold is itself
 * rejected).
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds = RATE_LIMIT_WINDOW_SECONDS
): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds

  await db
    .insert(rateLimitWindow)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitWindow.key, rateLimitWindow.windowStart],
      set: { count: sql`${rateLimitWindow.count} + 1` },
    })

  const row = await db
    .select({ count: rateLimitWindow.count })
    .from(rateLimitWindow)
    .where(and(eq(rateLimitWindow.key, key), eq(rateLimitWindow.windowStart, windowStart)))
    .get()

  const count = row?.count ?? 1
  const remaining = Math.max(0, limit - count)

  if (count > limit) {
    return { success: false, error: "Rate limit exceeded. Try again later.", status: 429 }
  }

  // Opportunistic cleanup of expired windows (one indexed delete per request).
  await db
    .delete(rateLimitWindow)
    .where(lt(rateLimitWindow.windowStart, windowStart - RATE_LIMIT_RETENTION_SECONDS))

  return { success: true, remaining }
}
