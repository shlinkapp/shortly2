import { NextRequest, NextResponse, after } from "next/server"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { getClientIpFromHeaders } from "@/lib/ip"
import { createLinkLog } from "@/lib/link-logs"
import { getLinkStatus } from "@/lib/link-status"
import { resolveCachedShortLink } from "@/lib/short-link-resolve"
import { getAllowedShortDomain } from "@/lib/site-domains"
import { and, eq, sql } from "drizzle-orm"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await initDb()
  const { slug } = await params
  const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const shortDomain = await getAllowedShortDomain(requestHost)

  if (!shortDomain) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Cached read of the link's immutable fields — popular links skip Turso here.
  const link = await resolveCachedShortLink(shortDomain.host, slug)

  if (!link) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  const ip = getClientIpFromHeaders(req.headers)
  const referrer = req.headers.get("referer")
  const userAgent = req.headers.get("user-agent")
  const logBase = {
    linkId: link.id,
    linkSlug: link.slug,
    ownerUserId: link.userId,
    referrer,
    userAgent,
    ipAddress: ip,
  }

  // `expiresAt` is immutable, so it can be trusted from cache. `clicks` is not
  // cached, so the click limit is enforced by the guarded UPDATE below instead.
  const expiresAtMs = link.expiresAt ? new Date(link.expiresAt).getTime() : null
  const expiredByDate =
    expiresAtMs !== null && !Number.isNaN(expiresAtMs) && Date.now() > expiresAtMs

  if (expiredByDate) {
    after(() => createLinkLog({
      ...logBase,
      eventType: "redirect_blocked_expired",
      statusCode: 410,
    }))

    return NextResponse.json({ error: "This link has expired." }, { status: 410 })
  }

  const now = new Date()
  const updateResult = await db
    .update(shortLink)
    .set({ clicks: sql`${shortLink.clicks} + 1` })
    .where(and(
      eq(shortLink.id, link.id),
      sql`(${shortLink.expiresAt} IS NULL OR ${shortLink.expiresAt} > ${now})`,
      sql`(${shortLink.maxClicks} IS NULL OR ${shortLink.clicks} < ${shortLink.maxClicks})`
    ))
    .run()

  if ((updateResult.rowsAffected ?? 0) < 1) {
    // Contention, expiry, click-limit, or a delete that the cache hasn't caught
    // yet: fall back to an authoritative read to decide the exact response.
    const latest = await db.select().from(shortLink).where(eq(shortLink.id, link.id)).get()
    if (!latest) {
      return NextResponse.json({ error: "This link is no longer available." }, { status: 410 })
    }

    const latestStatus = getLinkStatus(latest)
    if (latestStatus.expiredByDate) {
      after(() => createLinkLog({
        ...logBase,
        eventType: "redirect_blocked_expired",
        statusCode: 410,
      }))
      return NextResponse.json({ error: "This link has expired." }, { status: 410 })
    }

    if (latestStatus.expiredByClicks) {
      after(() => createLinkLog({
        ...logBase,
        eventType: "redirect_blocked_max_clicks",
        statusCode: 410,
      }))
      return NextResponse.json(
        { error: "This link reached the click limit." },
        { status: 410 }
      )
    }
  }

  after(() => createLinkLog({
    ...logBase,
    eventType: "redirect_success",
    statusCode: 302,
  }))

  return NextResponse.redirect(link.originalUrl, { status: 302 })
}
