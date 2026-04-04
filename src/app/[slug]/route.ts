import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { getClientIpFromHeaders } from "@/lib/ip"
import { createLinkLog } from "@/lib/link-logs"
import { getLinkStatus } from "@/lib/link-status"
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

  const link = await db
    .select()
    .from(shortLink)
    .where(and(eq(shortLink.domain, shortDomain.host), eq(shortLink.slug, slug)))
    .get()

  if (!link) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  const ip = getClientIpFromHeaders(req.headers)
  const referrer = req.headers.get("referer")
  const userAgent = req.headers.get("user-agent")
  const status = getLinkStatus(link)
  const logBase = {
    linkId: link.id,
    linkSlug: link.slug,
    ownerUserId: link.userId,
    referrer,
    userAgent,
    ipAddress: ip,
  }

  if (status.expiredByDate) {
    await createLinkLog({
      ...logBase,
      eventType: "redirect_blocked_expired",
      statusCode: 410,
    })
    await db.delete(shortLink).where(eq(shortLink.id, link.id))
    await createLinkLog({
      ...logBase,
      eventType: "link_auto_deleted_expired",
      statusCode: 410,
    })

    return NextResponse.json({ error: "This link has expired and has been removed." }, { status: 410 })
  }

  if (status.expiredByClicks) {
    await createLinkLog({
      ...logBase,
      eventType: "redirect_blocked_max_clicks",
      statusCode: 410,
    })
    await db.delete(shortLink).where(eq(shortLink.id, link.id))
    await createLinkLog({
      ...logBase,
      eventType: "link_auto_deleted_max_clicks",
      statusCode: 410,
    })

    return NextResponse.json(
      { error: "This link reached the click limit and has been removed." },
      { status: 410 }
    )
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
    const latest = await db.select().from(shortLink).where(eq(shortLink.id, link.id)).get()
    if (!latest) {
      return NextResponse.json({ error: "This link is no longer available." }, { status: 410 })
    }

    const latestStatus = getLinkStatus(latest)
    if (latestStatus.expiredByDate) {
      await createLinkLog({
        ...logBase,
        eventType: "redirect_blocked_expired",
        statusCode: 410,
      })
      await db.delete(shortLink).where(eq(shortLink.id, latest.id))
      await createLinkLog({
        ...logBase,
        eventType: "link_auto_deleted_expired",
        statusCode: 410,
      })
      return NextResponse.json({ error: "This link has expired and has been removed." }, { status: 410 })
    }

    if (latestStatus.expiredByClicks) {
      await createLinkLog({
        ...logBase,
        eventType: "redirect_blocked_max_clicks",
        statusCode: 410,
      })
      await db.delete(shortLink).where(eq(shortLink.id, latest.id))
      await createLinkLog({
        ...logBase,
        eventType: "link_auto_deleted_max_clicks",
        statusCode: 410,
      })
      return NextResponse.json(
        { error: "This link reached the click limit and has been removed." },
        { status: 410 }
      )
    }
  }

  await createLinkLog({
    ...logBase,
    eventType: "redirect_success",
    statusCode: 302,
  })

  return NextResponse.redirect(link.originalUrl, { status: 302 })
}
