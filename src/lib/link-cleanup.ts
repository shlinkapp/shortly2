import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { revalidateShortLinkCache } from "@/lib/cache/revalidate"
import { createLinkLog, type LinkLogEventType } from "@/lib/link-logs"
import { reportDiagnostic } from "@/lib/observability"
import { shortLink } from "@/lib/schema"

type AutoDeleteLinkInput = {
  linkId: string
  domain: string
  slug: string
  ownerUserId: string | null
  eventType: Extract<LinkLogEventType, "link_auto_deleted_expired" | "link_auto_deleted_max_clicks">
}

/**
 * Delete a link that hit its expiry/click limit. Called from `after()` on the
 * redirect path, so the request that discovers the expired link also reclaims
 * its row (and any cached negative/positive entries) without blocking the 410
 * response. Deletion is idempotent — concurrent redirects racing here are safe.
 */
export async function autoDeleteExpiredLink(input: AutoDeleteLinkInput) {
  try {
    await db.delete(shortLink).where(eq(shortLink.id, input.linkId))
    revalidateShortLinkCache(input.domain, input.slug)
    await createLinkLog({
      linkId: input.linkId,
      linkSlug: input.slug,
      ownerUserId: input.ownerUserId,
      eventType: input.eventType,
      statusCode: 410,
    })
  } catch (error) {
    reportDiagnostic({
      scope: "link_cleanup",
      event: "auto_delete_failed",
      details: { linkId: input.linkId, slug: input.slug },
      error,
      level: "warn",
    })
  }
}
