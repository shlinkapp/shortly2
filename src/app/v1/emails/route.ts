import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { createTempMailboxForUser, listTempMailboxesForUser } from "@/lib/temp-email"
import { parseBoundedInt } from "@/lib/http"
import { getSiteSettings } from "@/lib/site-settings"

export async function GET(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseBoundedInt(searchParams.get("page"), 1, 1, 100000)
  const limit = parseBoundedInt(searchParams.get("limit") ?? searchParams.get("size"), 10, 1, 100)

  const result = await listTempMailboxesForUser(authResult.data.userId, page, limit)
  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const emailAddress = typeof body?.emailAddress === "string" ? body.emailAddress.trim() : ""
  if (!emailAddress) {
    return NextResponse.json({ error: "emailAddress is required" }, { status: 400 })
  }

  const settings = await getSiteSettings()
  const result = await createTempMailboxForUser(authResult.data.userId, emailAddress, {
    hourlyCreateLimit: settings?.userMaxLinksPerHour ?? 50,
  })
  await touchApiKeyUsage(authResult.data.id, authResult.data.userId)

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ data: result.data }, { status: 201 })
}
