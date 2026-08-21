import { NextRequest, NextResponse } from "next/server"
import { db, initDb } from "@/lib/db"
import { apiKey } from "@/lib/schema"
import { and, eq } from "drizzle-orm"
import { isRequestOriginAllowed } from "@/lib/http"
import { requireActiveUser } from "@/lib/require-user"

async function requireUserSession() {
  return requireActiveUser()
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await requireUserSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
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
