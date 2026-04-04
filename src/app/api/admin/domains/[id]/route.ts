import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { siteDomain } from "@/lib/schema"
import { isRequestOriginAllowed } from "@/lib/http"
import { parseDomainHost } from "@/lib/site-domains"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

const updateDomainSchema = z.object({
  host: z.string().trim().min(1).max(255).optional(),
  supportsShortLinks: z.boolean().optional(),
  supportsTempEmail: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isDefaultShortDomain: z.boolean().optional(),
  isDefaultEmailDomain: z.boolean().optional(),
})

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return null
  }
  return session
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = updateDomainSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid domain payload" }, { status: 400 })
  }

  const { id } = await params
  const existing = await db.select().from(siteDomain).where(eq(siteDomain.id, id)).get()
  if (!existing) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 })
  }

  const normalizedHost = parsed.data.host === undefined ? existing.host : parseDomainHost(parsed.data.host)
  if (!normalizedHost) {
    return NextResponse.json({ error: "Invalid domain host" }, { status: 400 })
  }

  const nextSupportsShortLinks = parsed.data.supportsShortLinks ?? existing.supportsShortLinks
  const nextSupportsTempEmail = parsed.data.supportsTempEmail ?? existing.supportsTempEmail
  const nextIsActive = parsed.data.isActive ?? existing.isActive
  const nextIsDefaultShortDomain = parsed.data.isDefaultShortDomain ?? existing.isDefaultShortDomain
  const nextIsDefaultEmailDomain = parsed.data.isDefaultEmailDomain ?? existing.isDefaultEmailDomain

  if (nextIsDefaultShortDomain && (!nextSupportsShortLinks || !nextIsActive)) {
    return NextResponse.json({ error: "Default short-link domain must be active and support short links" }, { status: 400 })
  }

  if (nextIsDefaultEmailDomain && (!nextSupportsTempEmail || !nextIsActive)) {
    return NextResponse.json({ error: "Default email domain must be active and support temp email" }, { status: 400 })
  }

  const duplicate = await db.select({ id: siteDomain.id }).from(siteDomain).where(eq(siteDomain.host, normalizedHost)).get()
  if (duplicate && duplicate.id !== id) {
    return NextResponse.json({ error: "Domain already exists" }, { status: 409 })
  }

  if (nextIsDefaultShortDomain) {
    await db.update(siteDomain).set({ isDefaultShortDomain: false })
  }
  if (nextIsDefaultEmailDomain) {
    await db.update(siteDomain).set({ isDefaultEmailDomain: false })
  }

  await db
    .update(siteDomain)
    .set({
      host: normalizedHost,
      supportsShortLinks: nextSupportsShortLinks,
      supportsTempEmail: nextSupportsTempEmail,
      isActive: nextIsActive,
      isDefaultShortDomain: nextIsDefaultShortDomain,
      isDefaultEmailDomain: nextIsDefaultEmailDomain,
    })
    .where(eq(siteDomain.id, id))

  const updated = await db.select().from(siteDomain).where(eq(siteDomain.id, id)).get()
  return NextResponse.json({ data: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const { id } = await params
  const existing = await db.select().from(siteDomain).where(eq(siteDomain.id, id)).get()
  if (!existing) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 })
  }
  if (existing.isDefaultShortDomain || existing.isDefaultEmailDomain) {
    return NextResponse.json({ error: "Default domains cannot be deleted" }, { status: 400 })
  }

  await db.delete(siteDomain).where(eq(siteDomain.id, id))
  return NextResponse.json({ success: true })
}
