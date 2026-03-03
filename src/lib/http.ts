function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:"
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
