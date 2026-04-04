import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { deleteTempMailbox } from "@/lib/temp-email"
import { headers } from "next/headers"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
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

  const { id } = await params
  const success = await deleteTempMailbox(user.id, id)

  if (!success) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
