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
