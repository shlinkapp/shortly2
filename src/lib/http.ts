function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:"
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
