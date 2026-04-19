import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { deleteTempMailbox } from "@/lib/temp-email"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const { id } = await params
  const success = await deleteTempMailbox(authResult.data.userId, decodeURIComponent(id))
  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  if (!success) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
