import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { storeInboundEmail } from "@/lib/temp-email"

export async function POST(req: NextRequest) {
  await initDb()

  const expectedSecret = process.env.INBOUND_EMAIL_SECRET?.trim()
  if (!expectedSecret) {
    return NextResponse.json({ error: "Inbound email secret is not configured" }, { status: 500 })
  }

  const providedSecret = req.headers.get("x-inbound-email-secret")?.trim()
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const result = await storeInboundEmail(body as Parameters<typeof storeInboundEmail>[0])
  return NextResponse.json({ success: true, ...result.data })
}
