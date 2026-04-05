import { InferSelectModel, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { buildShortUrl } from "@/lib/http"
import { getLinkStatus, type LinkStatus } from "@/lib/link-status"
import { shortLink, user } from "@/lib/schema"

type AdminLinkRow = Pick<
  InferSelectModel<typeof shortLink>,
  "id" | "userId" | "domain" | "originalUrl" | "slug" | "clicks" | "maxClicks" | "expiresAt" | "createdAt"
> & {
  userName: string | null
  userEmail: string | null
}

export interface AdminLinkDto extends LinkStatus {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  slug: string
  domain: string
  shortUrl: string
  originalUrl: string
  clicks: number
  maxClicks: number | null
  expiresAt: Date | null
  createdAt: Date
}

export interface PaginatedAdminLinks {
  data: AdminLinkDto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function toAdminLinkDto(link: AdminLinkRow): AdminLinkDto {
  return {
    id: link.id,
    userId: link.userId,
    userName: link.userName,
    userEmail: link.userEmail,
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

export async function listAdminLinks(page: number, limit: number): Promise<PaginatedAdminLinks> {
  const offset = (page - 1) * limit

  const [totalRes, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(shortLink)
      .get(),
    db
      .select({
        id: shortLink.id,
        userId: shortLink.userId,
        userName: user.name,
        userEmail: user.email,
        domain: shortLink.domain,
        originalUrl: shortLink.originalUrl,
        slug: shortLink.slug,
        clicks: shortLink.clicks,
        maxClicks: shortLink.maxClicks,
        expiresAt: shortLink.expiresAt,
        createdAt: shortLink.createdAt,
      })
      .from(shortLink)
      .leftJoin(user, eq(shortLink.userId, user.id))
      .orderBy(desc(shortLink.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0

  return {
    data: rows.map(toAdminLinkDto),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
