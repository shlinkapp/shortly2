import { revalidateTag } from "next/cache"
import { CACHE_TAGS } from "./tags"

export function revalidateSiteSettingsCache() {
  revalidateTag(CACHE_TAGS.siteSettings, "max")
}

export function revalidateSiteDomainsCache() {
  revalidateTag(CACHE_TAGS.siteDomains, "max")
}
