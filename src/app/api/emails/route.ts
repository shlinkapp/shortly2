import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { createTempMailboxForUser, listTempMailboxesForUser } from "@/lib/temp-email"
import { parseBoundedInt } from "@/lib/http"
import { getSiteSettings } from "@/lib/site-settings"
import { headers } from "next/headers"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return null
  }
  return session.user
}

export async function GET(req: NextRequest) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit") ?? searchParams.get("size"), 10, 1, 100)

  const result = await listTempMailboxesForUser(user.id, page, limit)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  await initDb()

  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const emailAddress = typeof body?.emailAddress === "string" ? body.emailAddress.trim() : ""
  if (!emailAddress) {
    return NextResponse.json({ error: "emailAddress is required" }, { status: 400 })
  }

  const settings = await getSiteSettings()
  const result = await createTempMailboxForUser(user.id, emailAddress, {
    hourlyCreateLimit: settings?.userMaxLinksPerHour ?? 50,
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ data: result.data }, { status: 201 })
}
