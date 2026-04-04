import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { apiKey } from "@/lib/schema"
import { hashApiKey, isValidApiKeyFormat, parseApiKeyFromRequestHeaders } from "@/lib/api-keys"

export async function requireApiKeyUser(headers: Headers) {
  const rawApiKey = parseApiKeyFromRequestHeaders(headers)
  if (!rawApiKey || !isValidApiKeyFormat(rawApiKey)) {
    return { error: "Unauthorized: missing or invalid API key format" as const }
  }

  const hashedKey = await hashApiKey(rawApiKey)
  const keyRecord = await db
    .select({
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
    })
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashedKey))
    .get()

  if (!keyRecord) {
    return { error: "Unauthorized: API key not found" as const }
  }

  return { data: keyRecord }
}

export async function touchApiKeyUsage(keyId: string, userId: string) {
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKey.id, keyId), eq(apiKey.userId, userId)))
}
