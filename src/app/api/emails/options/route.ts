import { NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireActiveUser } from "@/lib/require-user"
import { listTempMailboxOptionsForUser } from "@/lib/temp-email"

export async function GET() {
  await initDb()

  const session = await requireActiveUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const data = await listTempMailboxOptionsForUser(session.user.id)
  return NextResponse.json({ data })
}
