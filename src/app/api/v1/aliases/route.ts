import { NextRequest, NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { requireApiKeyUser, touchApiKeyUsage } from "@/lib/api-auth"
import { createTempMailboxForUser } from "@/lib/temp-email"
import { generateRandomEmailPrefix } from "@/lib/random-email-prefix"
import { getAllowedEmailDomain } from "@/lib/site-domains"
import { getSiteSettings } from "@/lib/site-settings"

const MAX_ALIAS_CREATE_ATTEMPTS = 5
const ADDY_COMPAT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
}

function addyJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...ADDY_COMPAT_HEADERS,
      ...init?.headers,
    },
  })
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: ADDY_COMPAT_HEADERS,
  })
}

function buildAddyError(message: string, field?: string) {
  if (!field) {
    return { message }
  }

  return {
    message,
    errors: {
      [field]: [message],
    },
  }
}

function generateAliasLocalPart(minLength: number) {
  const normalizedMinLength = Math.max(1, Math.floor(minLength))
  if (normalizedMinLength > 64) {
    return null
  }

  const prefix = generateRandomEmailPrefix()
  if (prefix.length >= normalizedMinLength) {
    return prefix.slice(0, 64)
  }

  return null
}

export async function POST(req: NextRequest) {
  await initDb()

  const authResult = await requireApiKeyUser(req.headers)
  if ("error" in authResult) {
    return addyJson({ message: authResult.error }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const domain = typeof body?.domain === "string" ? body.domain.trim() : ""
  if (!domain) {
    return addyJson(buildAddyError("The domain field is required.", "domain"), { status: 422 })
  }

  const allowedDomain = await getAllowedEmailDomain(domain)
  if (!allowedDomain) {
    return addyJson(buildAddyError("This email domain is not enabled.", "domain"), { status: 403 })
  }

  const localPart = generateAliasLocalPart(allowedDomain.minLocalPartLength)
  if (!localPart) {
    return addyJson(buildAddyError("This email domain cannot generate compatible aliases.", "domain"), {
      status: 400,
    })
  }

  const settings = await getSiteSettings()
  let lastError: { error: string; status: number } | null = null

  for (let attempt = 0; attempt < MAX_ALIAS_CREATE_ATTEMPTS; attempt += 1) {
    const candidateLocalPart = attempt === 0
      ? localPart
      : generateAliasLocalPart(allowedDomain.minLocalPartLength)
    if (!candidateLocalPart) {
      break
    }

    const result = await createTempMailboxForUser(authResult.data.userId, `${candidateLocalPart}@${allowedDomain.host}`, {
      hourlyCreateLimit: settings?.userMaxLinksPerHour ?? 50,
    })

    if (!result.data) {
      lastError = {
        error: result.error || "Failed to create alias, please retry.",
        status: result.status || 500,
      }
      if (lastError.status !== 409) {
        break
      }
      continue
    }

    await touchApiKeyUsage(authResult.data.id, authResult.data.userId)
    return addyJson({
      data: {
        id: result.data.id,
        user_id: authResult.data.userId,
        local_part: result.data.localPart,
        domain: result.data.domain,
        email: result.data.emailAddress,
        active: true,
      },
    }, { status: 201 })
  }

  if (lastError?.status === 429) {
    return addyJson(buildAddyError(lastError.error), { status: 429 })
  }

  if (lastError?.status === 400 && lastError.error.includes("domain")) {
    return addyJson(buildAddyError(lastError.error, "domain"), { status: 403 })
  }

  return addyJson(buildAddyError(lastError?.error || "Failed to create alias, please retry."), {
    status: lastError?.status && lastError.status !== 409 ? lastError.status : 500,
  })
}
