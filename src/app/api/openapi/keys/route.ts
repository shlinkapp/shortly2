import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { apiKey } from "@/lib/schema"
import { eq, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { generateApiKey, hashApiKey } from "@/lib/api-keys"

async function requireUserSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  return session
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

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const finalName = (name || `API Key ${new Date().toISOString().slice(0, 10)}`).slice(0, 60)

  let created: { plainKey: string; id: string; keyPrefix: string } | null = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { key, keyPrefix } = generateApiKey()
    const keyHash = await hashApiKey(key)
    const id = crypto.randomUUID()
    try {
      await db.insert(apiKey).values({
        id,
        userId: session.user.id,
        name: finalName,
        keyPrefix,
        keyHash,
      })
      created = { plainKey: key, id, keyPrefix }
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

  const newKey = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.id, created.id))
    .get()

  return NextResponse.json({
    data: newKey,
    plainKey: created.plainKey,
  }, { status: 201 })
}
