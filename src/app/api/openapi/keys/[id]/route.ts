import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { apiKey } from "@/lib/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"

async function requireUserSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  return session
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await requireUserSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const existing = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, session.user.id)))
    .get()

  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 })
  }

  await db.delete(apiKey).where(eq(apiKey.id, id))
  return NextResponse.json({ success: true })
}
