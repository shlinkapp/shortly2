export const CACHE_TAGS = {
  siteSettings: "site-settings",
  siteDomains: "site-domains",
} as const

export function shortLinkTag(domain: string, slug: string): string {
  return `short-link:${domain}:${slug}`
}

export const PUBLIC_CONFIG_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300"
