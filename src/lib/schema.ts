import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
})

export const passkey = sqliteTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
  transports: text("transports"),
  aaguid: text("aaguid"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
})

export const shortLink = sqliteTable("short_link", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  originalUrl: text("original_url").notNull(),
  slug: text("slug").notNull().unique(),
  clicks: integer("clicks").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  maxClicks: integer("max_clicks"),
  creatorIp: text("creator_ip"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userIdIdx: index("short_link_user_id_idx").on(t.userId),
  createdAtIdx: index("short_link_created_at_idx").on(t.createdAt),
  creatorIpIdx: index("short_link_creator_ip_idx").on(t.creatorIp),
}))

export const clickLog = sqliteTable("click_log", {
  id: text("id").primaryKey(),
  linkId: text("link_id")
    .notNull()
    .references(() => shortLink.id, { onDelete: "cascade" }),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  linkIdIdx: index("click_log_link_id_idx").on(t.linkId),
  createdAtIdx: index("click_log_created_at_idx").on(t.createdAt),
}))

export const siteSetting = sqliteTable("site_setting", {
  id: text("id").primaryKey().default("default"),
  siteName: text("site_name").notNull().default("Shortly"),
  siteUrl: text("site_url").notNull().default("http://localhost:3000"),
  allowAnonymous: integer("allow_anonymous", { mode: "boolean" }).notNull().default(true),
  anonMaxLinksPerHour: integer("anon_max_links_per_hour").notNull().default(3),
  anonMaxClicks: integer("anon_max_clicks").notNull().default(10),
  userMaxLinksPerHour: integer("user_max_links_per_hour").notNull().default(50),
})
