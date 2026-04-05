import { db } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { eq, and, isNull, sql } from "drizzle-orm"

interface RateLimitParams {
    ip: string | null
    userId?: string
    allowAnonymous: boolean
    anonLimit: number
    userLimit: number
}

export type RateLimitResult =
  | { success: true }
  | { success: false; error: string; status: number }

export async function checkRateLimit(
  { ip, userId, allowAnonymous, anonLimit, userLimit }: RateLimitParams
): Promise<RateLimitResult> {
  // This is a soft rate limit based on recent persisted links, so concurrent requests can
  // temporarily pass before their inserts are visible to later count queries.
  if (!allowAnonymous && !userId) {
    return { success: false, error: "Authentication required", status: 401 }
  }

  const oneHourAgoInSeconds = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)

  if (!userId) {
    if (!ip) {
      if (process.env.NODE_ENV === "production") {
        return { success: false, error: "Unable to determine client IP", status: 400 }
      }
      return { success: true }
    }

    const recentLinks = await db.select({ count: sql<number>`count(*)` })
      .from(shortLink)
      .where(
        and(
          eq(shortLink.creatorIp, ip),
          isNull(shortLink.userId),
          sql`${shortLink.createdAt} >= ${oneHourAgoInSeconds}`
        )
      ).get()

    if (recentLinks && recentLinks.count >= anonLimit) {
      return { success: false, error: "Rate limit exceeded. Try again later.", status: 429 }
    }
  } else {
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
  }

  return { success: true }
}
