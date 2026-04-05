function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:"
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null
  const first = value.split(",")[0]?.trim()
  return first || null
}

function toHostname(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const withProtocol = trimmed.includes("://") ? trimmed : `http://${trimmed}`
  try {
    return new URL(withProtocol).hostname.toLowerCase()
  } catch {
    return null
  }
}

function toOrigin(value: string | null | undefined): string | null {
  const normalized = normalizeBaseUrl(value)
  if (!normalized) return null

  try {
    return new URL(normalized).origin
  } catch {
    return null
  }
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "")
  return normalized || "/"
}

function toHost(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const withProtocol = trimmed.includes("://") ? trimmed : `http://${trimmed}`
  try {
    return new URL(withProtocol).host.toLowerCase()
  } catch {
    return null
  }
}

function isSameOrNestedPath(targetPathname: string, candidatePathname: string): boolean {
  const normalizedTarget = normalizePathname(targetPathname)
  const normalizedCandidate = normalizePathname(candidatePathname)

  if (normalizedCandidate === "/") {
    return true
  }

  return (
    normalizedTarget === normalizedCandidate ||
    normalizedTarget.startsWith(`${normalizedCandidate}/`)
  )
}

function isMatchingSelfTargetCandidate(targetUrl: URL, candidate: string | null | undefined): boolean {
  const normalized = normalizeBaseUrl(candidate)
  if (!normalized) return false

  try {
    const parsedCandidate = new URL(normalized)
    return targetUrl.host === parsedCandidate.host && isSameOrNestedPath(targetUrl.pathname, parsedCandidate.pathname)
  } catch {
    return false
  }
}

function isMatchingSelfTargetHost(targetUrl: URL, candidateHost: string | null | undefined): boolean {
  const normalizedHost = toHost(candidateHost)
  if (!normalizedHost) return false
  return targetUrl.host === normalizedHost
}

function isHttpUrl(value: URL): boolean {
  return isHttpProtocol(value.protocol)
}

function isSelfTargetPathMatch(targetUrl: URL, siteUrl?: string | null, requestHost?: string | null): boolean {
  return (
    isMatchingSelfTargetCandidate(targetUrl, process.env.NEXT_PUBLIC_APP_URL) ||
    isMatchingSelfTargetCandidate(targetUrl, siteUrl) ||
    isMatchingSelfTargetHost(targetUrl, requestHost)
  )
}

function hasSelfTargetInQuery(targetUrl: URL, siteUrl?: string | null, requestHost?: string | null): boolean {
  const queryValues = Array.from(targetUrl.searchParams.values())

  for (const value of queryValues) {
    let nestedUrl: URL
    try {
      nestedUrl = new URL(value)
    } catch {
      continue
    }

    if (!isHttpUrl(nestedUrl)) {
      continue
    }

    if (isSelfTargetPathMatch(nestedUrl, siteUrl, requestHost)) {
      return true
    }
  }

  return false
}

export function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (!isHttpProtocol(parsed.protocol)) return null

    const pathname = parsed.pathname.replace(/\/+$/, "")
    return pathname ? `${parsed.origin}${pathname}` : parsed.origin
  } catch {
    return null
  }
}

export function resolvePublicAppUrl(siteUrl?: string | null): string {
  return (
    normalizeBaseUrl(siteUrl) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    "http://localhost:3000"
  )
}

export function resolveCanonicalAppUrl(headers: Headers): string | null {
  const canonicalUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
  if (!canonicalUrl) {
    return null
  }

  const requestHost = firstHeaderValue(headers.get("x-forwarded-host") ?? headers.get("host") ?? null)
  const canonicalHostname = toHostname(canonicalUrl)
  const requestHostname = toHostname(requestHost)

  if (!canonicalHostname || !requestHostname || canonicalHostname === requestHostname) {
    return null
  }

  return canonicalUrl
}

export function buildShortUrl(host: string, slug: string): string {
  const normalizedHost = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
  return `https://${normalizedHost}/${slug}`
}

export function isRequestOriginAllowed(headers: Headers, siteUrl?: string | null): boolean {
  const requestOrigin = toOrigin(headers.get("origin"))
  if (!requestOrigin) {
    return true
  }

  const candidates = [
    toOrigin(siteUrl),
    toOrigin(process.env.NEXT_PUBLIC_APP_URL),
    toOrigin(process.env.BETTER_AUTH_URL),
  ].filter((origin): origin is string => !!origin)

  if (candidates.length < 1) {
    return true
  }

  return candidates.includes(requestOrigin)
}

export function isSelfShortenTarget(
  targetUrl: string,
  headers?: Headers,
  siteUrl?: string | null
): boolean {
  let parsedTarget: URL
  try {
    parsedTarget = new URL(targetUrl)
  } catch {
    return false
  }

  if (!isHttpUrl(parsedTarget)) {
    return false
  }

  const requestHost = firstHeaderValue(headers?.get("x-forwarded-host") ?? headers?.get("host") ?? null)

  return (
    isSelfTargetPathMatch(parsedTarget, siteUrl, requestHost) ||
    hasSelfTargetInQuery(parsedTarget, siteUrl, requestHost)
  )
}

export function parseBoundedInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}
