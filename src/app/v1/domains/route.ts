import { NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { getActiveEmailDomains, getActiveShortDomains } from "@/lib/site-domains"

export async function GET() {
  await initDb()

  const [emailDomains, shortDomains] = await Promise.all([
    getActiveEmailDomains(),
    getActiveShortDomains(),
  ])

  return NextResponse.json({
    emailDomains: emailDomains.map((item) => ({
      host: item.host,
      isDefault: item.isDefaultEmailDomain,
      minLocalPartLength: item.minLocalPartLength,
    })),
    shortDomains: shortDomains.map((item) => ({
      host: item.host,
      isDefault: item.isDefaultShortDomain,
      minSlugLength: item.minSlugLength,
    })),
  })
}
