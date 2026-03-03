import { customAlphabet } from "nanoid"

const SLUG_ALPHABET = "abcdefhiklmnorstuvwxz"
const createSlug = customAlphabet(SLUG_ALPHABET)

export function generateSlug(length = 6): string {
  return createSlug(length)
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(slug)
}

export type UrlValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validateUrl(url: string): UrlValidationResult {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      valid: false,
      reason: "链接格式不正确，请输入完整的 http:// 或 https:// 链接",
    }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: "仅支持 http:// 或 https:// 协议的链接",
    }
  }

  const { hostname } = parsed

  // 阻止 localhost 和 .local 本地主机
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    return {
      valid: false,
      reason: "不支持本地地址（localhost 或 .local 域名）",
    }
  }

  // 判断是否为 IP 地址
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = hostname.match(ipv4Regex)

  if (match) {
    const parts = match.slice(1, 5).map(Number)

    // 检查各段是否在合法范围内 (0-255)
    if (parts.some((part) => part < 0 || part > 255)) {
      return {
        valid: false,
        reason: "IP 地址格式不正确",
      }
    }

    const [a, b] = parts

    // 阻止内网/私有 IP 地址
    if (
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      a === 127 || // 127.0.0.0/8 (loopback)
      (a === 169 && b === 254) || // 169.254.0.0/16 (link-local)
      a === 0 || // 0.0.0.0/8
      (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
      (a === 198 && (b === 18 || b === 19)) // 198.18.0.0/15 (benchmark tests)
    ) {
      return {
        valid: false,
        reason: "不支持内网或保留网段 IP 地址",
      }
    }
  }

  // 阻止 IPv6 回环及链路本地地址 (简单判断)
  if (hostname.includes("[") && hostname.includes("]")) {
    const ipv6 = hostname.slice(1, -1).toLowerCase()
    if (
      ipv6 === "::1" ||
      ipv6 === "::" ||
      ipv6.startsWith("fe80:") ||
      ipv6.startsWith("fc00:") ||
      ipv6.startsWith("fd00:")
    ) {
      return {
        valid: false,
        reason: "不支持 IPv6 回环、链路本地或内网地址",
      }
    }
  }

  return { valid: true }
}

export function isValidUrl(url: string): boolean {
  return validateUrl(url).valid
}
