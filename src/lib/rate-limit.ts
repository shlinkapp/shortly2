import { db } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { eq, and, sql } from "drizzle-orm"

interface RateLimitParams {
  userId?: string
  userLimit: number
}

export type RateLimitResult =
  | { success: true }
  | { success: false; error: string; status: number }

export async function checkRateLimit(
  { userId, userLimit }: RateLimitParams
): Promise<RateLimitResult> {
  // This is a soft rate limit based on recent persisted links, so concurrent requests can
  // temporarily pass before their inserts are visible to later count queries.
  if (!userId) {
    return { success: false, error: "Authentication required", status: 401 }
  }

  const oneHourAgoInSeconds = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)

  const recentLinks = await db.select({ count: sql<number>`count(*)` })
    .from(shortLink)
    .where(
      and(
        eq(shortLink.userId, userId),
        sql`${shortLink.createdAt} >= ${oneHourAgoInSeconds}`
      )
    ).get()

  if (recentLinks && recentLinks.count >= userLimit) {
    return { success: false, error: "Rate limit exceeded. Try again later.", status: 429 }
  }

  return { success: true }
}
