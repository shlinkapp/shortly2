import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { siteDomain } from "@/lib/schema"

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
  return db
    .select()
    .from(siteDomain)
    .where(and(eq(siteDomain.isActive, true), eq(siteDomain.supportsShortLinks, true)))
}

export async function getActiveEmailDomains() {
  return db
    .select()
    .from(siteDomain)
    .where(and(eq(siteDomain.isActive, true), eq(siteDomain.supportsTempEmail, true)))
}

export async function getDefaultShortDomain() {
  return db
    .select()
    .from(siteDomain)
    .where(and(
      eq(siteDomain.isActive, true),
      eq(siteDomain.supportsShortLinks, true),
      eq(siteDomain.isDefaultShortDomain, true)
    ))
    .get()
}

export async function getDefaultEmailDomain() {
  return db
    .select()
    .from(siteDomain)
    .where(and(
      eq(siteDomain.isActive, true),
      eq(siteDomain.supportsTempEmail, true),
      eq(siteDomain.isDefaultEmailDomain, true)
    ))
    .get()
}

export async function getAllowedShortDomain(host?: string | null) {
  if (!host) {
    return getDefaultShortDomain()
  }

  const normalized = normalizeDomainHost(host)
  if (!normalized) {
    return null
  }

  return db
    .select()
    .from(siteDomain)
    .where(and(
      eq(siteDomain.host, normalized),
      eq(siteDomain.isActive, true),
      eq(siteDomain.supportsShortLinks, true)
    ))
    .get()
}

export async function getAllowedEmailDomain(host?: string | null) {
  if (!host) {
    return getDefaultEmailDomain()
  }

  const normalized = normalizeDomainHost(host)
  if (!normalized) {
    return null
  }

  return db
    .select()
    .from(siteDomain)
    .where(and(
      eq(siteDomain.host, normalized),
      eq(siteDomain.isActive, true),
      eq(siteDomain.supportsTempEmail, true)
    ))
    .get()
}
