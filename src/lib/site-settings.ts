import { revalidateTag, unstable_cache } from "next/cache"
import { eq } from "drizzle-orm"
import { db, initDb } from "@/lib/db"
import { siteSetting } from "@/lib/schema"

const SITE_SETTINGS_TAG = "site-settings"
const SITE_SETTINGS_CACHE_KEY = process.env.TURSO_DATABASE_URL ?? "local"

async function readSiteSettingsFromDb() {
  await initDb()
  return db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
}

async function ensureSiteSettingsDbReady() {
  await initDb()
}

const getCachedSiteSettings = unstable_cache(
  async () => readSiteSettingsFromDb(),
  ["site-settings", SITE_SETTINGS_CACHE_KEY],
  { tags: [SITE_SETTINGS_TAG] }
)

export async function getSiteSettings() {
  return getCachedSiteSettings()
}

export async function getSiteSettingsFresh() {
  return readSiteSettingsFromDb()
}

type SiteSettingsWriteInput = {
  siteName?: string
  siteUrl?: string
  telegramBotUsername?: string
  userMaxLinksPerHour?: number
}

function buildSiteSettingsWrite(input: SiteSettingsWriteInput) {
  return {
    ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
    ...(input.siteUrl === undefined ? {} : { siteUrl: input.siteUrl }),
    ...(input.telegramBotUsername === undefined
      ? {}
      : { telegramBotUsername: input.telegramBotUsername }),
    ...(input.userMaxLinksPerHour === undefined
      ? {}
      : { userMaxLinksPerHour: input.userMaxLinksPerHour }),
  }
}

async function ensureSiteSettingsRow() {
  await ensureSiteSettingsDbReady()
  await db.insert(siteSetting).values({ id: "default" }).onConflictDoNothing()
}

export async function upsertSiteSettings(input: SiteSettingsWriteInput) {
  await ensureSiteSettingsDbReady()
  const changes = buildSiteSettingsWrite(input)

  if (Object.keys(changes).length === 0) {
    await ensureSiteSettingsRow()
    return
  }

  await db.insert(siteSetting).values({ id: "default", ...changes }).onConflictDoUpdate({
    target: siteSetting.id,
    set: changes,
  })
}

export async function writeSiteSettingsAndReadFresh(input: SiteSettingsWriteInput) {
  await upsertSiteSettings(input)
  revalidateSiteSettingsCache()
  return getSiteSettingsFresh()
}

export async function writeSiteSettings(input: SiteSettingsWriteInput) {
  return writeSiteSettingsAndReadFresh(input)
}

export const siteSettingsCache = {
  get: getSiteSettings,
  getFresh: getSiteSettingsFresh,
  revalidate: revalidateSiteSettingsCache,
  write: writeSiteSettings,
}

export function revalidateSiteSettingsCache() {
  revalidateTag(SITE_SETTINGS_TAG, "max")
}
