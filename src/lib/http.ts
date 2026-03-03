function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:"
}

function normalizeForContains(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "")
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
  const normalizedTarget = normalizeForContains(targetUrl)
  if (!normalizedTarget) return false

  const requestHost = firstHeaderValue(headers?.get("x-forwarded-host") ?? headers?.get("host") ?? null)
  const normalizedEnvAppUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
  const normalizedSiteUrl = normalizeBaseUrl(siteUrl)

  const containsCandidates = [
    normalizedEnvAppUrl,
    normalizedSiteUrl,
    requestHost,
  ].filter((candidate): candidate is string => !!candidate)

  for (const candidate of containsCandidates) {
    if (normalizedTarget.includes(normalizeForContains(candidate))) {
      return true
    }
  }

  let parsedTarget: URL
  try {
    parsedTarget = new URL(targetUrl)
  } catch {
    return false
  }

  const targetHostname = parsedTarget.hostname.toLowerCase()
  const hostnameCandidates = [
    toHostname(normalizedEnvAppUrl),
    toHostname(normalizedSiteUrl),
    toHostname(requestHost),
  ].filter((candidate): candidate is string => !!candidate)

  return hostnameCandidates.includes(targetHostname)
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
