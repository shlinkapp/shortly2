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

export async function checkRateLimit({ ip, userId, allowAnonymous, anonLimit, userLimit }: RateLimitParams) {
    if (!allowAnonymous && !userId) {
        return { success: false, error: "Authentication required", status: 401 }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    if (!userId) {
        if (ip) {
            const recentLinks = await db.select({ count: sql<number>`count(*)` })
                .from(shortLink)
                .where(
                    and(
                        eq(shortLink.creatorIp, ip),
                        isNull(shortLink.userId),
                        sql`${shortLink.createdAt} >= ${oneHourAgo.getTime() / 1000}`
                    )
                ).get()

            if (recentLinks && recentLinks.count >= anonLimit) {
                return { success: false, error: "Rate limit exceeded. Try again later.", status: 429 }
            }
        }
    } else {
        const recentLinks = await db.select({ count: sql<number>`count(*)` })
            .from(shortLink)
            .where(
                and(
                    eq(shortLink.userId, userId),
                    sql`${shortLink.createdAt} >= ${oneHourAgo.getTime() / 1000}`
                )
            ).get()

        if (recentLinks && recentLinks.count >= userLimit) {
            return { success: false, error: "Rate limit exceeded. Try again later.", status: 429 }
        }
    }

    return { success: true }
}
