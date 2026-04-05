import { revalidateTag, unstable_cache } from "next/cache"
import { eq } from "drizzle-orm"
import { db, initDb } from "@/lib/db"
import { siteSetting } from "@/lib/schema"

const SITE_SETTINGS_TAG = "site-settings"
const SITE_SETTINGS_CACHE_KEY = process.env.TURSO_DATABASE_URL ?? "local"

const getCachedSiteSettings = unstable_cache(
  async () => {
    await initDb()
    return db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
  },
  ["site-settings", SITE_SETTINGS_CACHE_KEY],
  { tags: [SITE_SETTINGS_TAG] }
)

export async function getSiteSettings() {
  return getCachedSiteSettings()
}

export async function getSiteSettingsFresh() {
  await initDb()
  return db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
}

export function revalidateSiteSettingsCache() {
  revalidateTag(SITE_SETTINGS_TAG, "max")
}
