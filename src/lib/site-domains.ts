import { revalidateTag, unstable_cache } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
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
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
  if (!trimmed) return null
  if (trimmed.includes("/") || trimmed.includes("@") || trimmed.includes("://")) return null
  return trimmed
}

export function parseDomainHost(value: string): string | null {
  return normalizeDomainHost(value)
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

export function revalidateSiteDomainsCache() {
  revalidateTag(SITE_DOMAINS_TAG, "max")
}
