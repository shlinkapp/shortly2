import { unstable_cache } from "next/cache"
import { and, eq } from "drizzle-orm"
import { shortLinkTag } from "@/lib/cache/tags"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"

// Only the fields that never change after a link is created live in the cache.
// `clicks` is intentionally excluded: it mutates on every redirect, so the
// hot path always relies on the atomic guarded UPDATE (and a fresh re-read on
// contention) rather than a cached counter.
export type ResolvedShortLink = {
  id: string
  userId: string | null
  originalUrl: string
  slug: string
  domain: string
  expiresAt: Date | null
  maxClicks: number | null
}

const SHORT_LINK_CACHE_KEY =
  process.env.DATABASE_CACHE_NAMESPACE ?? process.env.TURSO_DATABASE_URL ?? "local"

// Fallback self-heal window in case a revalidation is ever missed. Correctness
// on create/delete comes from revalidateShortLinkCache(); this is defense in
// depth, not the primary invalidation mechanism.
const SHORT_LINK_CACHE_TTL_SECONDS = 3600

/**
 * Resolve a short link by (domain, slug) through the Next.js data cache.
 *
 * The immutable fields are cached per link and tagged with `shortLinkTag`, so
 * a create or delete of that exact (domain, slug) invalidates only its own
 * entry. Popular links are served without touching Turso on the redirect read
 * path. Returns null for unknown slugs (a negative entry that is cleared the
 * moment a link with that slug is created, since it shares the same tag).
 */
export async function resolveCachedShortLink(
  domain: string,
  slug: string
): Promise<ResolvedShortLink | null> {
  const cached = unstable_cache(
    async (): Promise<ResolvedShortLink | null> => {
      await initDb()
      const row = await db
        .select({
          id: shortLink.id,
          userId: shortLink.userId,
          originalUrl: shortLink.originalUrl,
          slug: shortLink.slug,
          domain: shortLink.domain,
          expiresAt: shortLink.expiresAt,
          maxClicks: shortLink.maxClicks,
        })
        .from(shortLink)
        .where(and(eq(shortLink.domain, domain), eq(shortLink.slug, slug)))
        .get()

      return row ?? null
    },
    ["short-link-resolve", SHORT_LINK_CACHE_KEY, domain, slug],
    {
      tags: [shortLinkTag(domain, slug)],
      revalidate: SHORT_LINK_CACHE_TTL_SECONDS,
    }
  )

  return cached()
}
