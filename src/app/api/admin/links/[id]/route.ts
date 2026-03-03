import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { createLinkLog } from "@/lib/link-logs"
import { getClientIpFromHeaders } from "@/lib/ip"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const link = await db.select().from(shortLink).where(eq(shortLink.id, id)).get()
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  const ip = getClientIpFromHeaders(headersList)
  await createLinkLog({
    linkId: link.id,
    linkSlug: link.slug,
    ownerUserId: link.userId,
    eventType: "link_manual_deleted_by_admin",
    referrer: headersList.get("referer"),
    userAgent: headersList.get("user-agent"),
    ipAddress: ip,
    statusCode: 200,
  })

  await db.delete(shortLink).where(eq(shortLink.id, id))
  return NextResponse.json({ success: true })
}
