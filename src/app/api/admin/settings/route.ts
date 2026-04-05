import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { isRequestOriginAllowed, normalizeBaseUrl } from "@/lib/http"
import { reportDiagnostic } from "@/lib/observability"
import { getSiteSettings, writeSiteSettings } from "@/lib/site-settings"
import { headers } from "next/headers"
import { z } from "zod"

const optionalPositiveInt = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.number().int().min(1).max(100000).optional()
)

const settingsUpdateSchema = z.object({
  siteName: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().trim().min(1).max(80).optional()
  ),
  siteUrl: z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .trim()
      .max(2000)
      .refine((url) => url === "" || normalizeBaseUrl(url) !== null, "siteUrl must be a valid http(s) URL")
      .optional()
  ),
  allowAnonymous: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.boolean().optional()
  ),
  anonMaxLinksPerHour: optionalPositiveInt,
  anonMaxClicks: optionalPositiveInt,
  userMaxLinksPerHour: optionalPositiveInt,
})

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return null
  }
  return session
}

export async function GET() {
  await initDb()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const settings = await getSiteSettings()
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  await initDb()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!isRequestOriginAllowed(req.headers)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = settingsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 })
  }

  const {
    siteName,
    siteUrl,
    allowAnonymous,
    anonMaxLinksPerHour,
    anonMaxClicks,
    userMaxLinksPerHour,
  } = parsed.data

  try {
    const updated = await writeSiteSettings({
      siteName,
      siteUrl,
      allowAnonymous,
      anonMaxLinksPerHour,
      anonMaxClicks,
      userMaxLinksPerHour,
    })

    return NextResponse.json(updated)
  } catch (error) {
    reportDiagnostic({
      scope: "admin_settings",
      event: "write_failed",
      details: {
        actorUserId: session.user.id,
      },
      error,
    })
    return NextResponse.json({ error: "保存设置失败，请稍后重试" }, { status: 500 })
  }
}
