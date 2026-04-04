import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { markTempMessageRead } from "@/lib/temp-email"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const { messageId } = await params
  const success = await markTempMessageRead(authResult.data.userId, messageId)
  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  if (!success) {
    return NextResponse.json({ error: "Email message not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
