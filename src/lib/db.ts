import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
})

export const db = drizzle(client, { schema })

let initPromise: Promise<void> | null = null

export function initDb(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = _initDb()
  return initPromise
}

async function _initDb() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS passkey (
      id TEXT PRIMARY KEY,
      name TEXT,
      public_key TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL,
      counter INTEGER NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL,
      transports TEXT,
      aaguid TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS short_link (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      original_url TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      clicks INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      max_clicks INTEGER,
      creator_ip TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS click_log (
      id TEXT PRIMARY KEY,
      link_id TEXT NOT NULL REFERENCES short_link(id) ON DELETE CASCADE,
      referrer TEXT,
      user_agent TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS link_log (
      id TEXT PRIMARY KEY,
      link_id TEXT,
      link_slug TEXT NOT NULL,
      owner_user_id TEXT,
      event_type TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip_address TEXT,
      status_code INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS site_setting (
      id TEXT PRIMARY KEY DEFAULT 'default',
      site_name TEXT NOT NULL DEFAULT 'Shortly',
      site_url TEXT NOT NULL DEFAULT '',
      allow_anonymous INTEGER NOT NULL DEFAULT 1,
      anon_max_links_per_hour INTEGER NOT NULL DEFAULT 3,
      anon_max_clicks INTEGER NOT NULL DEFAULT 10,
      user_max_links_per_hour INTEGER NOT NULL DEFAULT 50
    );

    CREATE INDEX IF NOT EXISTS short_link_user_id_idx ON short_link(user_id);
    CREATE INDEX IF NOT EXISTS short_link_created_at_idx ON short_link(created_at);
    CREATE INDEX IF NOT EXISTS short_link_creator_ip_idx ON short_link(creator_ip);
    CREATE INDEX IF NOT EXISTS click_log_link_id_idx ON click_log(link_id);
    CREATE INDEX IF NOT EXISTS click_log_created_at_idx ON click_log(created_at);
    CREATE INDEX IF NOT EXISTS link_log_link_id_idx ON link_log(link_id);
    CREATE INDEX IF NOT EXISTS link_log_owner_user_id_idx ON link_log(owner_user_id);
    CREATE INDEX IF NOT EXISTS link_log_event_type_idx ON link_log(event_type);
    CREATE INDEX IF NOT EXISTS link_log_created_at_idx ON link_log(created_at);

    INSERT OR IGNORE INTO site_setting (id) VALUES ('default');
  `)

  await Promise.all([
    ensureColumn("short_link", "expires_at", "expires_at INTEGER"),
    ensureColumn("short_link", "max_clicks", "max_clicks INTEGER"),
    ensureColumn("short_link", "creator_ip", "creator_ip TEXT"),
    ensureColumn("site_setting", "anon_max_links_per_hour", "anon_max_links_per_hour INTEGER NOT NULL DEFAULT 3"),
    ensureColumn("site_setting", "anon_max_clicks", "anon_max_clicks INTEGER NOT NULL DEFAULT 10"),
    ensureColumn("site_setting", "user_max_links_per_hour", "user_max_links_per_hour INTEGER NOT NULL DEFAULT 50"),
  ])
}

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await client.execute(`PRAGMA table_info(${table});`)
  const columns = (result.rows as Array<Record<string, unknown>>).map((row) => String(row.name))

  if (columns.includes(column)) {
    return
  }

  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition};`)
}
