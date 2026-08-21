import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema"
import { reportDiagnostic } from "./observability"

const DATABASE_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.DATABASE_REQUEST_TIMEOUT_MS || "15000",
  10
)

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  // Bound every libSQL HTTP call with an explicit timeout so a slow/hung Turso
  // request cannot pin a serverless instance indefinitely.
  fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const signal = init?.signal ?? AbortSignal.timeout(DATABASE_REQUEST_TIMEOUT_MS)
    return fetch(input, { ...init, signal })
  },
})

// Optional SQL logging for debugging/diagnostics; enable with
// DATABASE_QUERY_LOG=true. Parameters are included so failing queries can be
// reproduced without exposing full payloads by default.
const queryLogger = process.env.DATABASE_QUERY_LOG === "true"
  ? {
      logQuery(query: string, params: unknown[]) {
        console.log(`[db] ${query}`, params.length > 0 ? { params } : undefined)
      },
    }
  : undefined

export const db = drizzle(client, { schema, logger: queryLogger })

const shouldAutoInitializeDatabase =
  process.env.NODE_ENV !== "production" || process.env.DATABASE_AUTO_INIT === "true"
const databaseReady = Promise.resolve()
let initPromise: Promise<void> | null = null

export function initDb(): Promise<void> {
  if (!shouldAutoInitializeDatabase) return databaseReady
  if (initPromise) return initPromise
  initPromise = _initDb().catch((error) => {
    // Never keep a permanently-rejected promise: the next initDb() call retries,
    // so a transient failure during cold start cannot wedge the whole process.
    initPromise = null
    throw error
  })
  return initPromise
}

const BOOTSTRAP_TABLE_STATEMENTS = `
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

  CREATE TABLE IF NOT EXISTS rate_limit_window (
    key TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1
  );
`

const BOOTSTRAP_INDEX_STATEMENTS = `
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
  CREATE INDEX IF NOT EXISTS link_log_link_created_idx ON link_log(link_id, created_at);
  CREATE INDEX IF NOT EXISTS link_log_created_at_idx ON link_log(created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS site_domain_host_idx ON site_domain(host);
  CREATE INDEX IF NOT EXISTS site_domain_short_idx ON site_domain(supports_short_links, is_active);
  CREATE INDEX IF NOT EXISTS site_domain_email_idx ON site_domain(supports_temp_email, is_active);
  CREATE UNIQUE INDEX IF NOT EXISTS site_domain_one_default_short_idx
    ON site_domain(is_default_short_domain) WHERE is_default_short_domain = 1;
  CREATE UNIQUE INDEX IF NOT EXISTS site_domain_one_default_email_idx
    ON site_domain(is_default_email_domain) WHERE is_default_email_domain = 1;
  CREATE UNIQUE INDEX IF NOT EXISTS telegram_binding_user_id_idx ON telegram_binding(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS telegram_binding_chat_id_idx ON telegram_binding(chat_id);
  CREATE UNIQUE INDEX IF NOT EXISTS temp_mailbox_email_address_idx ON temp_mailbox(email_address);
  CREATE INDEX IF NOT EXISTS temp_mailbox_user_id_idx ON temp_mailbox(user_id);
  CREATE INDEX IF NOT EXISTS temp_mailbox_domain_idx ON temp_mailbox(domain);
  CREATE INDEX IF NOT EXISTS temp_email_message_mailbox_id_idx ON temp_email_message(mailbox_id);
  CREATE INDEX IF NOT EXISTS temp_email_message_message_id_idx ON temp_email_message(message_id);
  CREATE UNIQUE INDEX IF NOT EXISTS temp_email_message_mailbox_message_idx
    ON temp_email_message(mailbox_id, message_id);
  CREATE INDEX IF NOT EXISTS temp_email_message_mailbox_received_idx
    ON temp_email_message(mailbox_id, received_at);
  CREATE INDEX IF NOT EXISTS temp_email_message_received_at_idx ON temp_email_message(received_at);
  CREATE INDEX IF NOT EXISTS temp_email_attachment_message_id_idx ON temp_email_attachment(message_id);
  CREATE INDEX IF NOT EXISTS temp_email_archive_message_id_idx ON temp_email_archive(message_id);
  CREATE INDEX IF NOT EXISTS temp_email_archive_to_email_idx ON temp_email_archive(to_email);
  CREATE UNIQUE INDEX IF NOT EXISTS temp_email_archive_to_message_idx
    ON temp_email_archive(to_email, message_id);
  CREATE INDEX IF NOT EXISTS temp_email_archive_received_at_idx ON temp_email_archive(received_at);
  CREATE INDEX IF NOT EXISTS temp_email_archive_attachment_archive_id_idx
    ON temp_email_archive_attachment(archive_id);
  CREATE INDEX IF NOT EXISTS api_key_user_id_idx ON api_key(user_id);
  CREATE INDEX IF NOT EXISTS api_key_key_prefix_idx ON api_key(key_prefix);
  CREATE UNIQUE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);
  CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_idx ON account(provider_id, account_id);
  CREATE UNIQUE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
  CREATE INDEX IF NOT EXISTS verification_expires_at_idx ON verification(expires_at);
  CREATE INDEX IF NOT EXISTS passkey_user_id_idx ON passkey(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS passkey_credential_id_idx ON passkey(credential_id);
  CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_window_key_window_idx ON rate_limit_window(key, window_start);
  CREATE INDEX IF NOT EXISTS rate_limit_window_start_idx ON rate_limit_window(window_start);

  INSERT OR IGNORE INTO site_setting (id) VALUES ('default');
`

async function _initDb() {
  // Each batch runs inside a single libSQL transaction, so a cold-start failure
  // cannot leave behind a half-created schema. All DDL is idempotent
  // (IF NOT EXISTS), so a retried boot converges too. Tables come first, then
  // legacy duplicates are removed, and only then are the (unique) indexes
  // created — a legacy database with duplicate account/passkey/verification
  // rows would otherwise fail the unique-index step.
  await client.batch(
    BOOTSTRAP_TABLE_STATEMENTS.split(";").map((statement) => statement.trim()).filter(Boolean)
  )

  await dedupeLegacyRows()

  await client.batch(
    BOOTSTRAP_INDEX_STATEMENTS.split(";").map((statement) => statement.trim()).filter(Boolean)
  )

  await Promise.all([
    ensureLegacyShortLinkColumns(),
    ensureLegacyUserColumns(),
    ensureLegacySiteSettingColumns(),
    ensureLegacySiteDomainColumns(),
  ])

  await ensureLegacyShortLinkDomainSlugMigration()
}

/**
 * One-time data cleanup for databases created before the hardening migrations:
 * - drop legacy plaintext email OTP rows (they would fail hash verification)
 * - collapse duplicate rows that would block the new unique indexes
 *   (account per provider, passkey per credential, verification per
 *   identifier, temp email per (mailbox, messageId))
 * - collapse duplicate default domain flags
 * All statements are idempotent.
 */
async function dedupeLegacyRows() {
  await client.batch([
    // Legacy plaintext email OTP codes (identifier `*-otp-*`, value is a short
    // code + attempts counter). Hashed OTP values are ~43+2 chars long.
    `DELETE FROM verification WHERE identifier LIKE '%-otp-%' AND length(value) < 40;`,

    // Keep the newest row per provider account.
    `DELETE FROM account WHERE id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY provider_id, account_id ORDER BY created_at DESC, id DESC) AS rn
         FROM account
       ) WHERE rn = 1
     );`,

    // Keep the newest passkey per credential id.
    `DELETE FROM passkey WHERE id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY credential_id ORDER BY created_at DESC, id DESC) AS rn
         FROM passkey
       ) WHERE rn = 1
     );`,

    // Keep the newest verification row per identifier.
    `DELETE FROM verification WHERE id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY identifier ORDER BY created_at DESC, id DESC) AS rn
         FROM verification
       ) WHERE rn = 1
     );`,

    // Keep the newest temp email message per (mailbox, messageId).
    `DELETE FROM temp_email_message WHERE message_id IS NOT NULL AND id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY mailbox_id, message_id ORDER BY received_at DESC, id DESC) AS rn
         FROM temp_email_message
         WHERE message_id IS NOT NULL
       ) WHERE rn = 1
     );`,

    // Keep the newest archived email per (to_email, messageId).
    `DELETE FROM temp_email_archive WHERE message_id IS NOT NULL AND id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY to_email, message_id ORDER BY received_at DESC, id DESC) AS rn
         FROM temp_email_archive
         WHERE message_id IS NOT NULL
       ) WHERE rn = 1
     );`,

    // Collapse duplicate "default" flags into a single row.
    `UPDATE site_domain SET is_default_short_domain = 0
     WHERE is_default_short_domain = 1
       AND id != (SELECT id FROM site_domain WHERE is_default_short_domain = 1 ORDER BY created_at DESC, id DESC LIMIT 1);`,
    `UPDATE site_domain SET is_default_email_domain = 0
     WHERE is_default_email_domain = 1
       AND id != (SELECT id FROM site_domain WHERE is_default_email_domain = 1 ORDER BY created_at DESC, id DESC LIMIT 1);`,
  ])
}

async function ensureLegacyShortLinkDomainSlugMigration() {
  const indexes = await client.execute(`PRAGMA index_list(short_link);`)
  const rows = indexes.rows as Array<Record<string, unknown>>
  const legacySlugUniqueIndexes = rows.filter((row) => Number(row.unique) === 1)

  for (const row of legacySlugUniqueIndexes) {
    const indexName = String(row.name)
    const indexInfo = await client.execute(`PRAGMA index_info(${indexName});`)
    const columns = (indexInfo.rows as Array<Record<string, unknown>>).map((infoRow) => String(infoRow.name))
    if (columns.length === 1 && columns[0] === "slug") {
      await rebuildLegacyShortLinkTable(indexName)
      return
    }
  }

  const hasDomainSlugIndex = rows.some((row) => String(row.name) === "short_link_domain_slug_idx")
  if (!hasDomainSlugIndex) {
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS short_link_domain_slug_idx ON short_link(domain, slug);")
  }
}

async function ensureLegacyShortLinkColumns() {
  await Promise.all([
    ensureColumn("short_link", "expires_at", "expires_at INTEGER"),
    ensureColumn("short_link", "max_clicks", "max_clicks INTEGER"),
    ensureColumn("short_link", "creator_ip", "creator_ip TEXT"),
    ensureColumn("short_link", "domain", "domain TEXT NOT NULL DEFAULT ''"),
  ])
}

async function ensureLegacyUserColumns() {
  await Promise.all([
    ensureColumn("user", "banned", "banned INTEGER NOT NULL DEFAULT 0"),
    ensureColumn("user", "ban_reason", "ban_reason TEXT"),
    ensureColumn("user", "ban_expires", "ban_expires INTEGER"),
  ])
}

async function ensureLegacySiteSettingColumns() {
  await Promise.all([
    ensureColumn("site_setting", "telegram_bot_username", "telegram_bot_username TEXT NOT NULL DEFAULT ''"),
    ensureColumn("site_setting", "user_max_links_per_hour", "user_max_links_per_hour INTEGER NOT NULL DEFAULT 50"),
  ])
}

async function ensureLegacySiteDomainColumns() {
  await ensureColumn("site_domain", "short_link_min_slug_length", "short_link_min_slug_length INTEGER NOT NULL DEFAULT 1")
  await ensureColumn("site_domain", "temp_email_min_local_part_length", "temp_email_min_local_part_length INTEGER NOT NULL DEFAULT 1")
}

async function rebuildLegacyShortLinkTable(legacyIndexName: string) {
  // Destructive one-time migration for databases that still carry a legacy
  // unique index on `short_link.slug` (pre-domain support). It DROPs and
  // recreates the table, so it must never run concurrently on multiple
  // instances. That is why it is gated behind an explicit opt-in env var.
  const optIn = process.env.DATABASE_LEGACY_REBUILD === "true"
  if (!optIn) {
    reportDiagnostic({
      scope: "db",
      event: "legacy_slug_unique_index_detected",
      details: {
        indexName: legacyIndexName,
        hint: "Set DATABASE_LEGACY_REBUILD=true on a single instance to migrate short_link to (domain, slug) uniqueness.",
      },
      level: "warn",
    })
    return
  }

  await client.executeMultiple(`
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

  reportDiagnostic({
    scope: "db",
    event: "legacy_short_link_table_rebuilt",
    details: { legacyIndexName },
    level: "warn",
  })
}

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await client.execute(`PRAGMA table_info(${table});`)
  const columns = (result.rows as Array<Record<string, unknown>>).map((row) => String(row.name))

  if (columns.includes(column)) {
    return
  }

  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition};`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Another instance may have added the same column between our PRAGMA check
    // and the ALTER; that is a benign race and the column now exists.
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error
    }
  }
}
