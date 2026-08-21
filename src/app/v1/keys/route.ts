import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { apiKey } from "@/lib/schema"
import { eq, desc } from "drizzle-orm"
import { generateApiKey, hashApiKey } from "@/lib/api-keys"
import { isRequestOriginAllowed } from "@/lib/http"
import { requireActiveUser } from "@/lib/require-user"

async function requireUserSession() {
  return requireActiveUser()
}

export async function GET() {
  await initDb()
  const session = await requireUserSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, session.user.id))
    .orderBy(desc(apiKey.createdAt))

  return NextResponse.json({ data: keys })
}

export async function POST(req: NextRequest) {
  await initDb()
  const session = await requireUserSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const finalName = (name || `API Key ${new Date().toISOString().slice(0, 10)}`).slice(0, 60)

  let created: {
    plainKey: string
    keyRecord: {
      id: string
      name: string
      keyPrefix: string
      lastUsedAt: Date | null
      createdAt: Date
    }
  } | null = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { key, keyPrefix } = generateApiKey()
    const keyHash = await hashApiKey(key)
    const id = crypto.randomUUID()
    try {
      const keyRecord = await db
        .insert(apiKey)
        .values({
          id,
          userId: session.user.id,
          name: finalName,
          keyPrefix,
          keyHash,
        })
        .returning({
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          lastUsedAt: apiKey.lastUsedAt,
          createdAt: apiKey.createdAt,
        })
        .get()
      created = { plainKey: key, keyRecord }
      break
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("UNIQUE")) {
        throw error
      }
    }
  }

  if (!created) {
    return NextResponse.json({ error: "Failed to create API key, please retry." }, { status: 500 })
  }

  return NextResponse.json({
    data: created.keyRecord,
    plainKey: created.plainKey,
  }, { status: 201 })
}
