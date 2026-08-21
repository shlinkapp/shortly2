import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { isRequestOriginAllowed } from "@/lib/http"
import { requireActiveUser } from "@/lib/require-user"
import { deleteTempMessage, getTempMessageDetail } from "@/lib/temp-email"

async function requireUser() {
  const session = await requireActiveUser()
  if (!session) {
    return null
  }
  return session.user
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { messageId } = await params
  const detail = await getTempMessageDetail(user.id, messageId)

  if (!detail) {
    return NextResponse.json({ error: "Email message not found" }, { status: 404 })
  }

  return NextResponse.json({ data: detail })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const { messageId } = await params
  const success = await deleteTempMessage(user.id, messageId)

  if (!success) {
    return NextResponse.json({ error: "Email message not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
