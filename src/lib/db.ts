import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createRequire } from "node:module"
import { createClient as createWebClient, type Client } from "@libsql/client/web"
import { drizzle as drizzleD1 } from "drizzle-orm/d1"
import { drizzle as drizzleLibSql, type LibSQLDatabase } from "drizzle-orm/libsql"
import * as schema from "./schema"

type Database = LibSQLDatabase<typeof schema>
type D1DatabaseBinding = {
  prepare(statement: string): {
    all<T>(): Promise<{ results: T[] }>
    run(): Promise<unknown>
  }
  exec(statements: string): Promise<unknown>
}
type DatabaseBackend =
  | { kind: "d1"; binding: D1DatabaseBinding }
  | { kind: "turso"; client: Client }

type RawSqlResult = { rows: Array<Record<string, unknown>> }
type SqlExecutor = {
  execute(statement: string): Promise<RawSqlResult>
  executeMultiple(statements: string): Promise<void>
}

let libSqlClient: Client | null = null
let libSqlDb: Database | null = null

function getLibSqlClient(): Client {
  if (libSqlClient) return libSqlClient

  const url = process.env.TURSO_DATABASE_URL
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required when DATABASE_DRIVER is not set to d1")
  }

  const createClient = url.startsWith("file:")
    ? getNodeLibSqlClientFactory()
    : createWebClient

  libSqlClient = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  })
  return libSqlClient
}

function getNodeLibSqlClientFactory(): typeof createWebClient {
  // Keep the native SQLite entry out of the Worker bundle. This branch only
  // runs for file: URLs in local Node.js development.
  const require = createRequire(import.meta.url)
  const moduleName = ["@libsql", "client", "node"].join("/")
  const nodeClient = require(moduleName) as { createClient: typeof createWebClient }
  return nodeClient.createClient
}

function getDatabaseBackend(): DatabaseBackend {
  const configuredDriver = process.env.DATABASE_DRIVER as "d1" | "turso" | undefined
  if (configuredDriver === "turso") {
    return { kind: "turso", client: getLibSqlClient() }
  }

  try {
    const binding = getCloudflareContext().env.DB as D1DatabaseBinding | undefined
    if (binding) return { kind: "d1", binding }
  } catch (error) {
    if (configuredDriver === "d1") {
      throw new Error("Cloudflare D1 binding DB is unavailable", { cause: error })
    }
  }

  if (configuredDriver === "d1") {
    throw new Error("Cloudflare D1 binding DB is unavailable")
  }

  return { kind: "turso", client: getLibSqlClient() }
}

export function isD1Database(): boolean {
  return getDatabaseBackend().kind === "d1"
}

export function getDb(): Database {
  const backend = getDatabaseBackend()
  if (backend.kind === "d1") {
    return drizzleD1(backend.binding as Parameters<typeof drizzleD1>[0], { schema }) as unknown as Database
  }

  libSqlDb ??= drizzleLibSql(backend.client, { schema })
  return libSqlDb
}

// Existing modules can keep importing `db`; the proxy resolves the real client
// only when a query starts, inside the current Worker request context.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDb()
    const value = Reflect.get(database, property, database) as unknown
    return typeof value === "function" ? value.bind(database) : value
  },
})

function createSqlExecutor(backend: DatabaseBackend): SqlExecutor {
  if (backend.kind === "turso") {
    return {
      async execute(statement) {
        const result = await backend.client.execute(statement)
        return { rows: result.rows as unknown as Array<Record<string, unknown>> }
      },
      async executeMultiple(statements) {
        await backend.client.executeMultiple(statements)
      },
    }
  }

  return {
    async execute(statement) {
      const prepared = backend.binding.prepare(statement)
      if (/^\s*(?:PRAGMA|SELECT|WITH)\b/i.test(statement)) {
        const result = await prepared.all<Record<string, unknown>>()
        return { rows: result.results ?? [] }
      }

      await prepared.run()
      return { rows: [] }
    },
    async executeMultiple(statements) {
      await backend.binding.exec(statements)
    },
  }
}

const shouldAutoInitializeDatabase =
  process.env.NODE_ENV !== "production" || String(process.env.DATABASE_AUTO_INIT) === "true"
const databaseReady = Promise.resolve()
let libSqlInitPromise: Promise<void> | null = null
let developmentD1InitPromise: Promise<void> | null = null

export function initDb(): Promise<void> {
  if (!shouldAutoInitializeDatabase) return databaseReady

  const backend = getDatabaseBackend()
  if (backend.kind === "d1") {
    // Production auto-init is an emergency fallback. Do not share its I/O
    // promise across requests; normal deployments should apply migrations.
    if (process.env.NODE_ENV === "production") {
      return initializeDatabase(createSqlExecutor(backend))
    }

    developmentD1InitPromise ??= initializeDatabase(createSqlExecutor(backend))
    return developmentD1InitPromise
  }

  libSqlInitPromise ??= initializeDatabase(createSqlExecutor(backend))
  return libSqlInitPromise
}

async function initializeDatabase(executor: SqlExecutor) {
  await executor.executeMultiple(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      ban_expires INTEGER,
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
      slug TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
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
      telegram_bot_username TEXT NOT NULL DEFAULT '',
      user_max_links_per_hour INTEGER NOT NULL DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS site_domain (
      id TEXT PRIMARY KEY,
      host TEXT NOT NULL UNIQUE,
      supports_short_links INTEGER NOT NULL DEFAULT 0,
      short_link_min_slug_length INTEGER NOT NULL DEFAULT 1,
      supports_temp_email INTEGER NOT NULL DEFAULT 0,
      temp_email_min_local_part_length INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default_short_domain INTEGER NOT NULL DEFAULT 0,
      is_default_email_domain INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS telegram_binding (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL UNIQUE,
      username TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS temp_mailbox (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      email_address TEXT NOT NULL UNIQUE,
      local_part TEXT NOT NULL,
      domain TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS temp_email_message (
      id TEXT PRIMARY KEY,
      mailbox_id TEXT NOT NULL REFERENCES temp_mailbox(id) ON DELETE CASCADE,
      message_id TEXT,
      "from" TEXT NOT NULL,
      from_name TEXT,
      subject TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      received_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_read INTEGER NOT NULL DEFAULT 0,
      cc_json TEXT NOT NULL DEFAULT '[]',
      reply_to_json TEXT NOT NULL DEFAULT '[]',
      headers_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS temp_email_attachment (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES temp_email_message(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      r2_path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS temp_email_archive (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      message_id TEXT,
      "from" TEXT NOT NULL,
      from_name TEXT,
      subject TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      received_at INTEGER NOT NULL DEFAULT (unixepoch()),
      cc_json TEXT NOT NULL DEFAULT '[]',
      reply_to_json TEXT NOT NULL DEFAULT '[]',
      headers_json TEXT NOT NULL DEFAULT '[]',
      failure_reason TEXT NOT NULL DEFAULT 'mailbox_not_found',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS temp_email_archive_attachment (
      id TEXT PRIMARY KEY,
      archive_id TEXT NOT NULL REFERENCES temp_email_archive(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      r2_path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS api_key (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS short_link_domain_slug_idx ON short_link(domain, slug);
    CREATE INDEX IF NOT EXISTS short_link_user_id_idx ON short_link(user_id);
    CREATE INDEX IF NOT EXISTS short_link_created_at_idx ON short_link(created_at);
    CREATE INDEX IF NOT EXISTS short_link_creator_ip_idx ON short_link(creator_ip);
    CREATE INDEX IF NOT EXISTS short_link_domain_idx ON short_link(domain);
    CREATE INDEX IF NOT EXISTS click_log_link_id_idx ON click_log(link_id);
    CREATE INDEX IF NOT EXISTS click_log_created_at_idx ON click_log(created_at);
    CREATE INDEX IF NOT EXISTS link_log_link_id_idx ON link_log(link_id);
    CREATE INDEX IF NOT EXISTS link_log_owner_user_id_idx ON link_log(owner_user_id);
    CREATE INDEX IF NOT EXISTS link_log_event_type_idx ON link_log(event_type);
    CREATE INDEX IF NOT EXISTS link_log_created_at_idx ON link_log(created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS site_domain_host_idx ON site_domain(host);
    CREATE INDEX IF NOT EXISTS site_domain_short_idx ON site_domain(supports_short_links, is_active);
    CREATE INDEX IF NOT EXISTS site_domain_email_idx ON site_domain(supports_temp_email, is_active);
    CREATE UNIQUE INDEX IF NOT EXISTS telegram_binding_user_id_idx ON telegram_binding(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS telegram_binding_chat_id_idx ON telegram_binding(chat_id);
    CREATE UNIQUE INDEX IF NOT EXISTS temp_mailbox_email_address_idx ON temp_mailbox(email_address);
    CREATE INDEX IF NOT EXISTS temp_mailbox_user_id_idx ON temp_mailbox(user_id);
    CREATE INDEX IF NOT EXISTS temp_mailbox_domain_idx ON temp_mailbox(domain);
    CREATE INDEX IF NOT EXISTS temp_email_message_mailbox_id_idx ON temp_email_message(mailbox_id);
    CREATE INDEX IF NOT EXISTS temp_email_message_message_id_idx ON temp_email_message(message_id);
    CREATE INDEX IF NOT EXISTS temp_email_message_received_at_idx ON temp_email_message(received_at);
    CREATE INDEX IF NOT EXISTS temp_email_attachment_message_id_idx ON temp_email_attachment(message_id);
    CREATE INDEX IF NOT EXISTS temp_email_archive_message_id_idx ON temp_email_archive(message_id);
    CREATE INDEX IF NOT EXISTS temp_email_archive_to_email_idx ON temp_email_archive(to_email);
    CREATE INDEX IF NOT EXISTS temp_email_archive_received_at_idx ON temp_email_archive(received_at);
    CREATE INDEX IF NOT EXISTS temp_email_archive_attachment_archive_id_idx ON temp_email_archive_attachment(archive_id);
    CREATE INDEX IF NOT EXISTS api_key_user_id_idx ON api_key(user_id);
    CREATE INDEX IF NOT EXISTS api_key_key_prefix_idx ON api_key(key_prefix);

    INSERT OR IGNORE INTO site_setting (id) VALUES ('default');
  `)

  await Promise.all([
    ensureLegacyShortLinkColumns(executor),
    ensureLegacyUserColumns(executor),
    ensureLegacySiteSettingColumns(executor),
    ensureLegacySiteDomainColumns(executor),
  ])

  await ensureLegacyShortLinkDomainSlugMigration(executor)
}

async function ensureLegacyShortLinkDomainSlugMigration(executor: SqlExecutor) {
  const indexes = await executor.execute(`PRAGMA index_list(short_link);`)
  const rows = indexes.rows as Array<Record<string, unknown>>
  const legacySlugUniqueIndexes = rows.filter((row) => Number(row.unique) === 1)

  for (const row of legacySlugUniqueIndexes) {
    const indexName = String(row.name)
    const indexInfo = await executor.execute(`PRAGMA index_info(${indexName});`)
    const columns = (indexInfo.rows as Array<Record<string, unknown>>).map((infoRow) => String(infoRow.name))
    if (columns.length === 1 && columns[0] === "slug") {
      await rebuildLegacyShortLinkTable(executor)
      return
    }
  }

  const hasDomainSlugIndex = rows.some((row) => String(row.name) === "short_link_domain_slug_idx")
  if (!hasDomainSlugIndex) {
    await executor.execute("CREATE UNIQUE INDEX IF NOT EXISTS short_link_domain_slug_idx ON short_link(domain, slug);")
  }
}

async function ensureLegacyShortLinkColumns(executor: SqlExecutor) {
  await Promise.all([
    ensureColumn(executor, "short_link", "expires_at", "expires_at INTEGER"),
    ensureColumn(executor, "short_link", "max_clicks", "max_clicks INTEGER"),
    ensureColumn(executor, "short_link", "creator_ip", "creator_ip TEXT"),
    ensureColumn(executor, "short_link", "domain", "domain TEXT NOT NULL DEFAULT ''"),
  ])
}

async function ensureLegacyUserColumns(executor: SqlExecutor) {
  await Promise.all([
    ensureColumn(executor, "user", "banned", "banned INTEGER NOT NULL DEFAULT 0"),
    ensureColumn(executor, "user", "ban_reason", "ban_reason TEXT"),
    ensureColumn(executor, "user", "ban_expires", "ban_expires INTEGER"),
  ])
}

async function ensureLegacySiteSettingColumns(executor: SqlExecutor) {
  await Promise.all([
    ensureColumn(executor, "site_setting", "telegram_bot_username", "telegram_bot_username TEXT NOT NULL DEFAULT ''"),
    ensureColumn(executor, "site_setting", "user_max_links_per_hour", "user_max_links_per_hour INTEGER NOT NULL DEFAULT 50"),
  ])
}

async function ensureLegacySiteDomainColumns(executor: SqlExecutor) {
  await ensureColumn(executor, "site_domain", "short_link_min_slug_length", "short_link_min_slug_length INTEGER NOT NULL DEFAULT 1")
  await ensureColumn(executor, "site_domain", "temp_email_min_local_part_length", "temp_email_min_local_part_length INTEGER NOT NULL DEFAULT 1")
}

async function rebuildLegacyShortLinkTable(executor: SqlExecutor) {
  await executor.executeMultiple(`
    PRAGMA foreign_keys=OFF;

    CREATE TABLE IF NOT EXISTS short_link__new (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      original_url TEXT NOT NULL,
      slug TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
      clicks INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      max_clicks INTEGER,
      creator_ip TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT INTO short_link__new (
      id,
      user_id,
      original_url,
      slug,
      domain,
      clicks,
      expires_at,
      max_clicks,
      creator_ip,
      created_at
    )
    SELECT
      id,
      user_id,
      original_url,
      slug,
      domain,
      clicks,
      expires_at,
      max_clicks,
      creator_ip,
      created_at
    FROM short_link;

    DROP TABLE short_link;
    ALTER TABLE short_link__new RENAME TO short_link;

    CREATE UNIQUE INDEX IF NOT EXISTS short_link_domain_slug_idx ON short_link(domain, slug);
    CREATE INDEX IF NOT EXISTS short_link_user_id_idx ON short_link(user_id);
    CREATE INDEX IF NOT EXISTS short_link_created_at_idx ON short_link(created_at);
    CREATE INDEX IF NOT EXISTS short_link_creator_ip_idx ON short_link(creator_ip);
    CREATE INDEX IF NOT EXISTS short_link_domain_idx ON short_link(domain);

    PRAGMA foreign_keys=ON;
  `)
}

async function ensureColumn(
  executor: SqlExecutor,
  table: string,
  column: string,
  definition: string
) {
  const result = await executor.execute(`PRAGMA table_info(${table});`)
  const columns = (result.rows as Array<Record<string, unknown>>).map((row) => String(row.name))

  if (columns.includes(column)) {
    return
  }

  await executor.execute(`ALTER TABLE ${table} ADD COLUMN ${definition};`)
}
