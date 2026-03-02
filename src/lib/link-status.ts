import { InferSelectModel } from "drizzle-orm"
import { shortLink } from "@/lib/schema"

type LinkStatusInput = Pick<InferSelectModel<typeof shortLink>, "clicks" | "maxClicks" | "expiresAt">

export interface LinkStatus {
  hasClickLimit: boolean
  hasExpiration: boolean
  isExpired: boolean
  expiredByClicks: boolean
  expiredByDate: boolean
}

export function getLinkStatus(link: LinkStatusInput): LinkStatus {
  const hasClickLimit = link.maxClicks !== null
  const hasExpiration = link.expiresAt !== null
  const expiresAtMs = link.expiresAt ? new Date(link.expiresAt).getTime() : null
  const expiredByDate = expiresAtMs !== null && !Number.isNaN(expiresAtMs) && Date.now() > expiresAtMs
  const expiredByClicks = hasClickLimit && link.clicks >= (link.maxClicks ?? 0)

  return {
    hasClickLimit,
    hasExpiration,
    isExpired: expiredByDate || expiredByClicks,
    expiredByClicks,
    expiredByDate,
  }
}
