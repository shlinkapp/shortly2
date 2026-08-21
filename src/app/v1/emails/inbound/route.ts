import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { initDb } from "@/lib/db"
import { storeInboundEmail } from "@/lib/temp-email"
import { z } from "zod"

const inboundAttachmentSchema = z.object({
  filename: z.string().max(255).optional(),
  mimeType: z.string().max(255).optional(),
  r2Path: z.string().max(1024).optional(),
  size: z.number().int().min(0).max(64 * 1024 * 1024).optional(),
})

const inboundEmailSchema = z.object({
  to: z.string().min(1).max(320),
  from: z.string().min(1).max(320),
  fromName: z.string().max(255).optional(),
  subject: z.string().max(1000).optional(),
  text: z.string().max(2_000_000).optional(),
  html: z.string().max(2_000_000).optional(),
  date: z.string().max(100).optional(),
  messageId: z.string().max(1000).optional(),
  cc: z.string().max(100_000).optional(),
  replyTo: z.string().max(100_000).optional(),
  headers: z.string().max(1_000_000).optional(),
  attachments: z.array(inboundAttachmentSchema).max(50).optional(),
})

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) {
    // Still run a comparison to keep the timing roughly constant.
    timingSafeEqual(providedBuffer, providedBuffer)
    return false
  }
  return timingSafeEqual(providedBuffer, expectedBuffer)
}

export async function POST(req: NextRequest) {
  await initDb()

  const expectedSecret = process.env.INBOUND_EMAIL_SECRET?.trim()
  if (!expectedSecret) {
    return NextResponse.json({ error: "Inbound email secret is not configured" }, { status: 500 })
  }

  const providedSecret = req.headers.get("x-inbound-email-secret")?.trim()
  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = inboundEmailSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inbound email payload" }, { status: 400 })
  }

  const result = await storeInboundEmail(parsed.data)
  return NextResponse.json({ success: true, ...result.data })
}
