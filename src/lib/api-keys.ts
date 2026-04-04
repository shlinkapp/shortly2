const API_KEY_PREFIX = "sk_shortly_"
const API_KEY_RANDOM_BYTES = 32

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function hashApiKey(rawKey: string): Promise<string> {
  const pepper = process.env.API_KEY_PEPPER || process.env.BETTER_AUTH_SECRET || ""
  const source = new TextEncoder().encode(`${rawKey}:${pepper}`)
  const hashBuffer = await crypto.subtle.digest("SHA-256", source)
  return bytesToHex(new Uint8Array(hashBuffer))
}

export function generateApiKey(): { key: string; keyPrefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(API_KEY_RANDOM_BYTES))
  const secret = Buffer.from(bytes).toString("base64url")
  const key = `${API_KEY_PREFIX}${secret}`
  return {
    key,
    keyPrefix: key.slice(0, API_KEY_PREFIX.length + 8),
  }
}

export function parseApiKeyFromRequestHeaders(headers: Headers): string | null {
  const authHeader = headers.get("authorization")
  if (authHeader) {
    const parts = authHeader.split(" ")
    if (parts.length >= 2 && parts[0].toLowerCase() === "bearer") {
      const value = parts.slice(1).join(" ").trim()
      return value || null
    }
  }

  const apiKeyHeader = headers.get("x-api-key")
  if (apiKeyHeader?.trim()) {
    return apiKeyHeader.trim()
  }

  const workerApiKeyHeader = headers.get("wrdo-api-key")
  if (workerApiKeyHeader?.trim()) {
    return workerApiKeyHeader.trim()
  }

  return null
}

export function isValidApiKeyFormat(value: string): boolean {
  return /^sk_shortly_[A-Za-z0-9_-]{20,}$/.test(value)
}
