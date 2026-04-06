import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAdminTempMessageDetail } from "@/lib/temp-email"
import { headers } from "next/headers"

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return null
  }
  return session
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await initDb()

  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { messageId } = await params
  const detail = await getAdminTempMessageDetail(messageId)

  if (!detail) {
    return NextResponse.json({ error: "Email message not found" }, { status: 404 })
  }

  return NextResponse.json({ data: detail })
}
