import { isIP } from "node:net"

interface ClientIpOptions {
  cfConnectingIp?: string | null
  trustXForwardedFor?: boolean
  trustedProxyHops?: number
}

function normalizeIp(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  const trimmed = candidate.trim()
  if (!trimmed) return null

  const noBrackets = trimmed.startsWith("[") && trimmed.includes("]")
    ? trimmed.slice(1, trimmed.indexOf("]"))
    : trimmed

  const maybeIpv4WithPort = noBrackets.includes(".") && noBrackets.includes(":")
    ? noBrackets.split(":")[0]
    : noBrackets

  return isIP(maybeIpv4WithPort) ? maybeIpv4WithPort : null
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function parseTrustedProxyHops(rawValue: number | null | undefined): number {
  const fallbackFromEnv = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10)
  const fallback = Number.isFinite(fallbackFromEnv) ? fallbackFromEnv : 1
  const candidate = rawValue ?? fallback
  if (!Number.isFinite(candidate)) return 1
  return Math.min(10, Math.max(1, Math.floor(candidate)))
}

export function getClientIp(
  ip: string | null,
  forwardedFor: string | null,
  realIp: string | null,
  options?: ClientIpOptions
): string | null {
  const direct = normalizeIp(ip)
  if (direct) return direct

  const cloudflare = normalizeIp(options?.cfConnectingIp)
  if (cloudflare) return cloudflare

  const real = normalizeIp(realIp)
  if (real) return real

  const trustXForwardedFor = options?.trustXForwardedFor ?? parseBooleanEnv("TRUST_X_FORWARDED_FOR", true)
  if (!trustXForwardedFor) {
    return null
  }

  const trustedProxyHops = parseTrustedProxyHops(options?.trustedProxyHops)
  if (forwardedFor) {
    const chain = forwardedFor
      .split(",")
      .map((part) => normalizeIp(part.trim()))
      .filter((part): part is string => !!part)

    if (chain.length > 0) {
      const index = Math.max(0, chain.length - trustedProxyHops)
      return chain[index] ?? null
    }
  }

  return null
}

export function getClientIpFromHeaders(
  headers: Headers,
  ip: string | null = null,
  options?: Omit<ClientIpOptions, "cfConnectingIp">
): string | null {
  return getClientIp(
    ip,
    headers.get("x-forwarded-for"),
    headers.get("x-real-ip"),
    {
      ...options,
      cfConnectingIp: headers.get("cf-connecting-ip"),
    }
  )
}
