import { NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { isRequestOriginAllowed } from "@/lib/http"
import { requireActiveUser } from "@/lib/require-user"
import { deleteTempMailbox } from "@/lib/temp-email"

async function requireUser() {
  const session = await requireActiveUser()
  if (!session) {
    return null
  }
  return session.user
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const { id } = await params
  const success = await deleteTempMailbox(user.id, id)

  if (!success) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
