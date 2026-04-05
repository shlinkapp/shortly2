import { InferSelectModel, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { buildShortUrl } from "@/lib/http"
import { getLinkStatus, type LinkStatus } from "@/lib/link-status"
import { shortLink } from "@/lib/schema"

type OwnerLinkRow = Pick<
  InferSelectModel<typeof shortLink>,
  "id" | "slug" | "domain" | "originalUrl" | "clicks" | "maxClicks" | "expiresAt" | "createdAt"
>

export interface OwnerLinkDto extends LinkStatus {
  id: string
  slug: string
  domain: string
  shortUrl: string
  originalUrl: string
  clicks: number
  maxClicks: number | null
  expiresAt: Date | null
  createdAt: Date
}

export interface PaginatedOwnerLinks {
  data: OwnerLinkDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function toOwnerLinkDto(link: OwnerLinkRow): OwnerLinkDto {
  return {
    id: link.id,
    slug: link.slug,
    domain: link.domain,
    shortUrl: buildShortUrl(link.domain, link.slug),
    originalUrl: link.originalUrl,
    clicks: link.clicks,
    maxClicks: link.maxClicks,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
    ...getLinkStatus(link),
  }
}

export async function listLinksForUser(userId: string, page: number, limit: number): Promise<PaginatedOwnerLinks> {
  const offset = (page - 1) * limit
  const [totalRes, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(shortLink)
      .where(eq(shortLink.userId, userId))
      .get(),
    db
      .select({
        id: shortLink.id,
        slug: shortLink.slug,
        domain: shortLink.domain,
        originalUrl: shortLink.originalUrl,
        clicks: shortLink.clicks,
        maxClicks: shortLink.maxClicks,
        expiresAt: shortLink.expiresAt,
        createdAt: shortLink.createdAt,
      })
      .from(shortLink)
      .where(eq(shortLink.userId, userId))
      .orderBy(desc(shortLink.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0

  return {
    data: rows.map(toOwnerLinkDto),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
