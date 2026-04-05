import { revalidateTag, unstable_cache } from "next/cache"
import { and, asc, eq, ne } from "drizzle-orm"
import { db, initDb } from "@/lib/db"
import { siteDomain } from "@/lib/schema"

type ActiveShortDomain = {
  host: string
  isDefaultShortDomain: boolean
}

type ActiveEmailDomain = {
  host: string
  isDefaultEmailDomain: boolean
}

type SiteDomainDefaultsInput = {
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
}

type CreateSiteDomainRecordInput = {
  id: string
  host: string
  supportsShortLinks: boolean
  supportsTempEmail: boolean
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
  createdAt: Date
}

type UpdateSiteDomainRecordInput = {
  host: string
  supportsShortLinks: boolean
  supportsTempEmail: boolean
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
}

type SiteDomainWriter = Pick<typeof db, "insert" | "select" | "update">

type DeleteSiteDomainWriter = Pick<typeof db, "delete">

export type SiteDomainWriteInput = CreateSiteDomainRecordInput | UpdateSiteDomainRecordInput

const SITE_DOMAINS_TAG = "site-domains"
const SITE_DOMAINS_CACHE_KEY = process.env.TURSO_DATABASE_URL ?? "local"

const getCachedActiveShortDomains = unstable_cache(
  async (): Promise<ActiveShortDomain[]> => {
    await initDb()
    return db
      .select({
        host: siteDomain.host,
        isDefaultShortDomain: siteDomain.isDefaultShortDomain,
      })
      .from(siteDomain)
      .where(and(eq(siteDomain.isActive, true), eq(siteDomain.supportsShortLinks, true)))
      .orderBy(asc(siteDomain.host))
  },
  ["site-domains", SITE_DOMAINS_CACHE_KEY, "short"],
  { tags: [SITE_DOMAINS_TAG] }
)

const getCachedActiveEmailDomains = unstable_cache(
  async (): Promise<ActiveEmailDomain[]> => {
    await initDb()
    return db
      .select({
        host: siteDomain.host,
        isDefaultEmailDomain: siteDomain.isDefaultEmailDomain,
      })
      .from(siteDomain)
      .where(and(eq(siteDomain.isActive, true), eq(siteDomain.supportsTempEmail, true)))
      .orderBy(asc(siteDomain.host))
  },
  ["site-domains", SITE_DOMAINS_CACHE_KEY, "email"],
  { tags: [SITE_DOMAINS_TAG] }
)

function normalizeDomainHost(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes("@") || trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) return null

  const candidate = trimmed.replace(/\.+$/, "")
  if (!candidate) return null

  try {
    const url = new URL(`http://${candidate}`)
    if (url.username || url.password) return null
    if (url.protocol !== "http:") return null
    if (url.port) return null
    if (url.pathname !== "/" || url.search || url.hash) return null

    const normalizedHost = url.hostname.toLowerCase()
    if (!normalizedHost) return null
    if (normalizedHost.length > 255) return null
    if (!normalizedHost.includes(".")) return null
    if (normalizedHost.startsWith(".") || normalizedHost.endsWith(".")) return null
    if (normalizedHost.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
      return null
    }

    return normalizedHost
  } catch {
    return null
  }
}

export function parseDomainHost(value: string): string | null {
  return normalizeDomainHost(value)
}

async function clearDefaultSiteDomainFlags(
  writer: SiteDomainWriter,
  input: SiteDomainDefaultsInput,
  excludeId?: string
) {
  if (input.isDefaultShortDomain) {
    await writer
      .update(siteDomain)
      .set({ isDefaultShortDomain: false })
      .where(
        excludeId
          ? and(eq(siteDomain.isDefaultShortDomain, true), ne(siteDomain.id, excludeId))
          : eq(siteDomain.isDefaultShortDomain, true)
      )
  }

  if (input.isDefaultEmailDomain) {
    await writer
      .update(siteDomain)
      .set({ isDefaultEmailDomain: false })
      .where(
        excludeId
          ? and(eq(siteDomain.isDefaultEmailDomain, true), ne(siteDomain.id, excludeId))
          : eq(siteDomain.isDefaultEmailDomain, true)
      )
  }
}

export async function createSiteDomainRecord(input: CreateSiteDomainRecordInput) {
  return db.transaction(async (tx) => {
    await clearDefaultSiteDomainFlags(tx, input)
    await tx.insert(siteDomain).values(input)
    return tx.select().from(siteDomain).where(eq(siteDomain.id, input.id)).get()
  })
}

export async function updateSiteDomainRecord(id: string, input: UpdateSiteDomainRecordInput) {
  return db.transaction(async (tx) => {
    await clearDefaultSiteDomainFlags(tx, input, id)
    await tx.update(siteDomain).set(input).where(eq(siteDomain.id, id))
    return tx.select().from(siteDomain).where(eq(siteDomain.id, id)).get()
  })
}

async function deleteSiteDomainRecord(id: string, writer: DeleteSiteDomainWriter = db) {
  await writer.delete(siteDomain).where(eq(siteDomain.id, id))
}

export function revalidateSiteDomainsCache() {
  revalidateTag(SITE_DOMAINS_TAG, "max")
}

export async function writeCreatedSiteDomain(input: CreateSiteDomainRecordInput) {
  const created = await createSiteDomainRecord(input)
  revalidateSiteDomainsCache()
  return created
}

export async function writeUpdatedSiteDomain(id: string, input: UpdateSiteDomainRecordInput) {
  const updated = await updateSiteDomainRecord(id, input)
  revalidateSiteDomainsCache()
  return updated
}

export async function writeDeletedSiteDomain(id: string) {
  await deleteSiteDomainRecord(id)
  revalidateSiteDomainsCache()
}

export async function getActiveShortDomains() {
  return getCachedActiveShortDomains()
}

export async function getActiveEmailDomains() {
  return getCachedActiveEmailDomains()
}

export async function getDefaultShortDomain() {
  const domains = await getCachedActiveShortDomains()
  return domains.find((item) => item.isDefaultShortDomain) ?? null
}

export async function getDefaultEmailDomain() {
  const domains = await getCachedActiveEmailDomains()
  return domains.find((item) => item.isDefaultEmailDomain) ?? null
}

export async function getAllowedShortDomain(host?: string | null) {
  if (!host) {
    return getDefaultShortDomain()
  }

  const normalized = normalizeDomainHost(host)
  if (!normalized) {
    return null
  }

  const domains = await getCachedActiveShortDomains()
  return domains.find((item) => item.host === normalized) ?? null
}

export async function getAllowedEmailDomain(host?: string | null) {
  if (!host) {
    return getDefaultEmailDomain()
  }

  const normalized = normalizeDomainHost(host)
  if (!normalized) {
    return null
  }

  const domains = await getCachedActiveEmailDomains()
  return domains.find((item) => item.host === normalized) ?? null
}

