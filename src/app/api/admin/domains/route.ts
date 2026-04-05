import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { siteDomain } from "@/lib/schema"
import { isRequestOriginAllowed } from "@/lib/http"
import { parseDomainHost, revalidateSiteDomainsCache } from "@/lib/site-domains"
import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

const createDomainSchema = z.object({
  host: z.string().trim().min(1).max(255),
  supportsShortLinks: z.boolean().optional().default(false),
  supportsTempEmail: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  isDefaultShortDomain: z.boolean().optional().default(false),
  isDefaultEmailDomain: z.boolean().optional().default(false),
})

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return null
  }
  return session
}

export async function GET() {
  await initDb()
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const domains = await db.select().from(siteDomain).orderBy(asc(siteDomain.host))
  return NextResponse.json({ data: domains })
}

export async function POST(req: NextRequest) {
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

  const parsed = createDomainSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid domain payload" }, { status: 400 })
  }

  const normalizedHost = parseDomainHost(parsed.data.host)
  if (!normalizedHost) {
    return NextResponse.json({ error: "Invalid domain host" }, { status: 400 })
  }

  const {
    supportsShortLinks,
    supportsTempEmail,
    isActive,
    isDefaultShortDomain,
    isDefaultEmailDomain,
  } = parsed.data

  if (isDefaultShortDomain && (!supportsShortLinks || !isActive)) {
    return NextResponse.json({ error: "Default short-link domain must be active and support short links" }, { status: 400 })
  }

  if (isDefaultEmailDomain && (!supportsTempEmail || !isActive)) {
    return NextResponse.json({ error: "Default email domain must be active and support temp email" }, { status: 400 })
  }

  const existing = await db.select({ id: siteDomain.id }).from(siteDomain).where(eq(siteDomain.host, normalizedHost)).get()
  if (existing) {
    return NextResponse.json({ error: "Domain already exists" }, { status: 409 })
  }

  if (isDefaultShortDomain) {
    await db.update(siteDomain).set({ isDefaultShortDomain: false })
  }
  if (isDefaultEmailDomain) {
    await db.update(siteDomain).set({ isDefaultEmailDomain: false })
  }

  const id = crypto.randomUUID()
  await db.insert(siteDomain).values({
    id,
    host: normalizedHost,
    supportsShortLinks,
    supportsTempEmail,
    isActive,
    isDefaultShortDomain,
    isDefaultEmailDomain,
    createdAt: new Date(),
  })

  const created = await db.select().from(siteDomain).where(eq(siteDomain.id, id)).get()
  revalidateSiteDomainsCache()
  return NextResponse.json({ data: created }, { status: 201 })
}
