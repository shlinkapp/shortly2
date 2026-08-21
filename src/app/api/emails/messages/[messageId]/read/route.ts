import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireActiveUser } from "@/lib/require-user"
import { markTempMessageRead } from "@/lib/temp-email"

async function requireUser() {
  const session = await requireActiveUser()
  if (!session) {
    return null
  }
  return session.user
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { messageId } = await params
  const success = await markTempMessageRead(user.id, messageId)

  if (!success) {
    return NextResponse.json({ error: "Email message not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
