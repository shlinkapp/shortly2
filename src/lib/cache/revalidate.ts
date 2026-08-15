import { revalidateTag } from "next/cache"
import { CACHE_TAGS, shortLinkTag } from "./tags"

export function revalidateSiteSettingsCache() {
  revalidateTag(CACHE_TAGS.siteSettings, "max")
}

export function revalidateSiteDomainsCache() {
  revalidateTag(CACHE_TAGS.siteDomains, "max")
}

export function revalidateShortLinkCache(domain: string, slug: string) {
  revalidateTag(shortLinkTag(domain, slug), "max")
}
