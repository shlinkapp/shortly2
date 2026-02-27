const CHARS = "abcdefghijklmnopqrstuvwxyz"

export function generateSlug(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("")
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(slug)
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false
    }

    const { hostname } = parsed

    // 阻止 localhost 和 .local 本地主机
    if (hostname === "localhost" || hostname.endsWith(".local")) {
      return false
    }

    // 判断是否为 IP 地址
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    const match = hostname.match(ipv4Regex)

    if (match) {
      const parts = match.slice(1, 5).map(Number)

      // 检查各段是否在合法范围内 (0-255)
      if (parts.some((part) => part < 0 || part > 255)) {
        return false
      }

      const [a, b, c] = parts

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
        return false
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
        return false
      }
    }

    return true
  } catch {
    return false
  }
}
