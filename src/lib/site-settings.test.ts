import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"

type UpsertSiteSettings = (typeof import("./site-settings"))["upsertSiteSettings"]
type WriteSiteSettings = (typeof import("./site-settings"))["writeSiteSettings"]
type WriteSiteSettingsAndReadFresh = (typeof import("./site-settings"))["writeSiteSettingsAndReadFresh"]

type Operation = {
  kind: string
  values?: Record<string, unknown>
  set?: Record<string, unknown>
  tag?: string
  profile?: string
}

let upsertSiteSettings: UpsertSiteSettings
let writeSiteSettings: WriteSiteSettings
let writeSiteSettingsAndReadFresh: WriteSiteSettingsAndReadFresh
let operations: Operation[] = []

mock.module("next/cache", () => ({
  unstable_cache: (callback: (...args: unknown[]) => unknown) => callback,
  revalidateTag: (tag: string, profile: string) => {
    operations.push({ kind: "cache:revalidateTag", tag, profile })
  },
}))

mock.module("@/lib/db", () => ({
  initDb: async () => {
    operations.push({ kind: "db:init" })
  },
  db: {
    insert() {
      return {
        values(values: Record<string, unknown>) {
          operations.push({ kind: "insert:values", values })
          return {
            onConflictDoNothing: async () => {
              operations.push({ kind: "insert:onConflictDoNothing" })
            },
            onConflictDoUpdate: async ({ set }: { target: unknown; set: Record<string, unknown> }) => {
              operations.push({ kind: "insert:onConflictDoUpdate", set })
            },
          }
        },
      }
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                get: async () => ({
                  id: "default",
                  siteName: "Shortly Pro",
                  telegramBotUsername: "shortly_bot",
                  userMaxLinksPerHour: 25,
                }),
              }
            },
          }
        },
      }
    },
  },
}))

beforeAll(async () => {
  ;({ upsertSiteSettings, writeSiteSettings, writeSiteSettingsAndReadFresh } = await import("./site-settings"))
})

beforeEach(() => {
  operations = []
})

describe("upsertSiteSettings", () => {
  it("ensures the default settings row exists when no changes are provided", async () => {
    await upsertSiteSettings({})

    expect(operations).toEqual([
      { kind: "db:init" },
      { kind: "db:init" },
      { kind: "insert:values", values: { id: "default" } },
      { kind: "insert:onConflictDoNothing" },
    ])
  })

  it("upserts only provided settings fields onto the default row", async () => {
    await upsertSiteSettings({
      siteName: "Shortly Pro",
      siteUrl: "https://short.ly",
      telegramBotUsername: "shortly_bot",
      userMaxLinksPerHour: 25,
    })

    expect(operations).toEqual([
      { kind: "db:init" },
      {
        kind: "insert:values",
        values: {
          id: "default",
          siteName: "Shortly Pro",
          siteUrl: "https://short.ly",
          telegramBotUsername: "shortly_bot",
          userMaxLinksPerHour: 25,
        },
      },
      {
        kind: "insert:onConflictDoUpdate",
        set: {
          siteName: "Shortly Pro",
          siteUrl: "https://short.ly",
          telegramBotUsername: "shortly_bot",
          userMaxLinksPerHour: 25,
        },
      },
    ])
  })
})

describe("writeSiteSettings", () => {
  it("revalidates the site settings cache and returns fresh settings", async () => {
    const result = await writeSiteSettings({
      siteName: "Shortly Pro",
      telegramBotUsername: "shortly_bot",
      userMaxLinksPerHour: 25,
    })

    expect(operations).toEqual([
      { kind: "db:init" },
      {
        kind: "insert:values",
        values: {
          id: "default",
          siteName: "Shortly Pro",
          telegramBotUsername: "shortly_bot",
          userMaxLinksPerHour: 25,
        },
      },
      {
        kind: "insert:onConflictDoUpdate",
        set: {
          siteName: "Shortly Pro",
          telegramBotUsername: "shortly_bot",
          userMaxLinksPerHour: 25,
        },
      },
      { kind: "cache:revalidateTag", tag: "site-settings", profile: "max" },
      { kind: "db:init" },
    ])

    expect(result).toEqual({
      id: "default",
      siteName: "Shortly Pro",
      telegramBotUsername: "shortly_bot",
      userMaxLinksPerHour: 25,
    })
  })
})

describe("writeSiteSettingsAndReadFresh", () => {
  it("uses the explicit fresh read path after revalidation", async () => {
    const result = await writeSiteSettingsAndReadFresh({
      siteName: "Shortly Pro",
    })

    expect(operations).toEqual([
      { kind: "db:init" },
      {
        kind: "insert:values",
        values: {
          id: "default",
          siteName: "Shortly Pro",
        },
      },
      {
        kind: "insert:onConflictDoUpdate",
        set: {
          siteName: "Shortly Pro",
        },
      },
      { kind: "cache:revalidateTag", tag: "site-settings", profile: "max" },
      { kind: "db:init" },
    ])

    expect(result).toEqual({
      id: "default",
      siteName: "Shortly Pro",
      telegramBotUsername: "shortly_bot",
      userMaxLinksPerHour: 25,
    })
  })
})
