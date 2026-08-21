import { NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireActiveAdmin } from "@/lib/require-user"
import { getAdminTempMessageDetail } from "@/lib/temp-email"

async function requireAdmin() {
  return requireActiveAdmin()
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
