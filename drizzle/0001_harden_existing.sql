-- ============================================================================
-- Hardening migration for databases that already existed before versioned
-- migrations were introduced (i.e. schemas created by the runtime bootstrap or
-- `drizzle-kit push`).
--
-- How to apply (pick ONE of these):
--   1. Fresh databases (no existing tables): apply drizzle/0000_init_schema.sql
--      via `drizzle-kit migrate` — this file is NOT needed.
--   2. Existing databases: run the statements below manually (sqlite3 CLI,
--      libSQL CLI, or your migration runner) BEFORE running `drizzle-kit push`.
--      They are idempotent and safe to re-run.
--
-- Contents:
--   a) drop legacy plaintext email OTP rows (storeOTP switched to "hashed")
--   b) deduplicate rows that would block the new unique indexes
--   c) create the new indexes / unique indexes / rate_limit_window table
-- ============================================================================

-- (a) Legacy plaintext email OTP codes (identifier `*-otp-*`, value is a short
--     code + attempts counter; hashed values are ~45 chars long).
DELETE FROM verification WHERE identifier LIKE '%-otp-%' AND length(value) < 40;

-- (b) Deduplicate (keep the newest row per key).
DELETE FROM account WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY provider_id, account_id ORDER BY created_at DESC, id DESC) AS rn
    FROM account
  ) WHERE rn = 1
);

DELETE FROM passkey WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY credential_id ORDER BY created_at DESC, id DESC) AS rn
    FROM passkey
  ) WHERE rn = 1
);

DELETE FROM verification WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY identifier ORDER BY created_at DESC, id DESC) AS rn
    FROM verification
  ) WHERE rn = 1
);

DELETE FROM temp_email_message WHERE message_id IS NOT NULL AND id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY mailbox_id, message_id ORDER BY received_at DESC, id DESC) AS rn
    FROM temp_email_message
    WHERE message_id IS NOT NULL
  ) WHERE rn = 1
);

DELETE FROM temp_email_archive WHERE message_id IS NOT NULL AND id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY to_email, message_id ORDER BY received_at DESC, id DESC) AS rn
    FROM temp_email_archive
    WHERE message_id IS NOT NULL
  ) WHERE rn = 1
);

UPDATE site_domain SET is_default_short_domain = 0
WHERE is_default_short_domain = 1
  AND id != (SELECT id FROM site_domain WHERE is_default_short_domain = 1 ORDER BY created_at DESC, id DESC LIMIT 1);

UPDATE site_domain SET is_default_email_domain = 0
WHERE is_default_email_domain = 1
  AND id != (SELECT id FROM site_domain WHERE is_default_email_domain = 1 ORDER BY created_at DESC, id DESC LIMIT 1);

-- (c) New indexes (idempotent; `drizzle-kit push` creates them too, but they
--     are listed here so the dedup + index creation happen in one step).
CREATE UNIQUE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_idx ON account(provider_id, account_id);
CREATE UNIQUE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
CREATE INDEX IF NOT EXISTS verification_expires_at_idx ON verification(expires_at);
CREATE INDEX IF NOT EXISTS passkey_user_id_idx ON passkey(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS passkey_credential_id_idx ON passkey(credential_id);
CREATE UNIQUE INDEX IF NOT EXISTS temp_email_message_mailbox_message_idx
  ON temp_email_message(mailbox_id, message_id);
CREATE INDEX IF NOT EXISTS temp_email_message_mailbox_received_idx
  ON temp_email_message(mailbox_id, received_at);
CREATE UNIQUE INDEX IF NOT EXISTS temp_email_archive_to_message_idx
  ON temp_email_archive(to_email, message_id);
CREATE INDEX IF NOT EXISTS link_log_link_created_idx ON link_log(link_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS site_domain_one_default_short_idx
  ON site_domain(is_default_short_domain) WHERE is_default_short_domain = 1;
CREATE UNIQUE INDEX IF NOT EXISTS site_domain_one_default_email_idx
  ON site_domain(is_default_email_domain) WHERE is_default_email_domain = 1;

CREATE TABLE IF NOT EXISTS rate_limit_window (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_window_key_window_idx ON rate_limit_window(key, window_start);
CREATE INDEX IF NOT EXISTS rate_limit_window_start_idx ON rate_limit_window(window_start);
