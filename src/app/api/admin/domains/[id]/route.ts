import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { isUniqueConstraintError } from "@/lib/db-errors"
import { siteDomain } from "@/lib/schema"
import { isRequestOriginAllowed } from "@/lib/http"
import { requireActiveAdmin } from "@/lib/require-user"
import { parseDomainHost, writeDeletedSiteDomain, writeUpdatedSiteDomain } from "@/lib/site-domains"
import { eq } from "drizzle-orm"
import { z } from "zod"

const updateDomainSchema = z.object({
  host: z.string().trim().min(1).max(255).optional(),
  supportsShortLinks: z.boolean().optional(),
  shortLinkMinSlugLength: z.number().int().min(1).max(50).optional(),
  supportsTempEmail: z.boolean().optional(),
  tempEmailMinLocalPartLength: z.number().int().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
  isDefaultShortDomain: z.boolean().optional(),
  isDefaultEmailDomain: z.boolean().optional(),
})

async function requireAdmin() {
  return requireActiveAdmin()
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

  // Update only the fields present in the request body: two concurrent PATCHes
  // editing different fields must not overwrite each other's changes (lost
  // update) by re-writing the whole row from a stale read.
  const changes: Parameters<typeof writeUpdatedSiteDomain>[1] = {}
  if (parsed.data.host !== undefined) {
    const normalizedHost = parseDomainHost(parsed.data.host)
    if (!normalizedHost) {
      return NextResponse.json({ error: "Invalid domain host" }, { status: 400 })
    }
    changes.host = normalizedHost
  }
  if (parsed.data.supportsShortLinks !== undefined) changes.supportsShortLinks = parsed.data.supportsShortLinks
  if (parsed.data.supportsTempEmail !== undefined) changes.supportsTempEmail = parsed.data.supportsTempEmail
  if (parsed.data.shortLinkMinSlugLength !== undefined) changes.shortLinkMinSlugLength = parsed.data.shortLinkMinSlugLength
  if (parsed.data.tempEmailMinLocalPartLength !== undefined) changes.tempEmailMinLocalPartLength = parsed.data.tempEmailMinLocalPartLength
  if (parsed.data.isActive !== undefined) changes.isActive = parsed.data.isActive
  if (parsed.data.isDefaultShortDomain !== undefined) changes.isDefaultShortDomain = parsed.data.isDefaultShortDomain
  if (parsed.data.isDefaultEmailDomain !== undefined) changes.isDefaultEmailDomain = parsed.data.isDefaultEmailDomain

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const nextSupportsShortLinks = changes.supportsShortLinks ?? existing.supportsShortLinks
  const nextSupportsTempEmail = changes.supportsTempEmail ?? existing.supportsTempEmail
  const nextIsActive = changes.isActive ?? existing.isActive

  if (changes.isDefaultShortDomain && (!nextSupportsShortLinks || !nextIsActive)) {
    return NextResponse.json({ error: "Default short-link domain must be active and support short links" }, { status: 400 })
  }

  if (changes.isDefaultEmailDomain && (!nextSupportsTempEmail || !nextIsActive)) {
    return NextResponse.json({ error: "Default email domain must be active and support temp email" }, { status: 400 })
  }

  if (changes.host) {
    const duplicate = await db.select({ id: siteDomain.id }).from(siteDomain).where(eq(siteDomain.host, changes.host)).get()
    if (duplicate && duplicate.id !== id) {
      return NextResponse.json({ error: "Domain already exists" }, { status: 409 })
    }
  }

  try {
    const updated = await writeUpdatedSiteDomain(id, changes)
    return NextResponse.json({ data: updated })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "Another domain is already the default for this type" },
        { status: 409 }
      )
    }
    throw error
  }
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

  await writeDeletedSiteDomain(id)
  return NextResponse.json({ success: true })
}
