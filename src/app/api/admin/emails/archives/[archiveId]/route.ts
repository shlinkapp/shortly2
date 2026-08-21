import { NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireActiveAdmin } from "@/lib/require-user"
import { getAdminArchivedTempMessageDetail } from "@/lib/temp-email"

async function requireAdmin() {
  return requireActiveAdmin()
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ archiveId: string }> }
) {
  await initDb()

  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { archiveId } = await params
  const detail = await getAdminArchivedTempMessageDetail(archiveId)

  if (!detail) {
    return NextResponse.json({ error: "Archived email not found" }, { status: 404 })
  }

  return NextResponse.json({ data: detail })
}
