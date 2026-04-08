import { NextResponse } from "next/server"
import { initDb } from "@/lib/db"
import { getActiveEmailDomains, getActiveShortDomains } from "@/lib/site-domains"
import { getSiteSettings } from "@/lib/site-settings"

export async function GET() {
  await initDb()

  const [emailDomains, shortDomains, settings] = await Promise.all([
    getActiveEmailDomains(),
    getActiveShortDomains(),
    getSiteSettings(),
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
    telegramBotUsername: settings?.telegramBotUsername || "",
  })
}
