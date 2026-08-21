CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_key_hash_unique` ON `api_key` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_key_user_id_idx` ON `api_key` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_key_key_prefix_idx` ON `api_key` (`key_prefix`);--> statement-breakpoint
CREATE TABLE `click_log` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`referrer` text,
	`user_agent` text,
	`ip_address` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `short_link`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `click_log_link_id_idx` ON `click_log` (`link_id`);--> statement-breakpoint
CREATE INDEX `click_log_created_at_idx` ON `click_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `link_log` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text,
	`link_slug` text NOT NULL,
	`owner_user_id` text,
	`event_type` text NOT NULL,
	`referrer` text,
	`user_agent` text,
	`ip_address` text,
	`status_code` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `link_log_link_id_idx` ON `link_log` (`link_id`);--> statement-breakpoint
CREATE INDEX `link_log_owner_user_id_idx` ON `link_log` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `link_log_event_type_idx` ON `link_log` (`event_type`);--> statement-breakpoint
CREATE INDEX `link_log_link_created_idx` ON `link_log` (`link_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `link_log_created_at_idx` ON `link_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`aaguid` text,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_user_id_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credential_id_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE TABLE `rate_limit_window` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_window_key_window_idx` ON `rate_limit_window` (`key`,`window_start`);--> statement-breakpoint
CREATE INDEX `rate_limit_window_start_idx` ON `rate_limit_window` (`window_start`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `short_link` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`original_url` text NOT NULL,
	`slug` text NOT NULL,
	`domain` text DEFAULT '' NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`max_clicks` integer,
	`creator_ip` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `short_link_domain_slug_idx` ON `short_link` (`domain`,`slug`);--> statement-breakpoint
CREATE INDEX `short_link_user_id_idx` ON `short_link` (`user_id`);--> statement-breakpoint
CREATE INDEX `short_link_created_at_idx` ON `short_link` (`created_at`);--> statement-breakpoint
CREATE INDEX `short_link_creator_ip_idx` ON `short_link` (`creator_ip`);--> statement-breakpoint
CREATE INDEX `short_link_domain_idx` ON `short_link` (`domain`);--> statement-breakpoint
CREATE TABLE `site_domain` (
	`id` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`supports_short_links` integer DEFAULT false NOT NULL,
	`short_link_min_slug_length` integer DEFAULT 1 NOT NULL,
	`supports_temp_email` integer DEFAULT false NOT NULL,
	`temp_email_min_local_part_length` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_default_short_domain` integer DEFAULT false NOT NULL,
	`is_default_email_domain` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_domain_host_idx` ON `site_domain` (`host`);--> statement-breakpoint
CREATE INDEX `site_domain_short_idx` ON `site_domain` (`supports_short_links`,`is_active`);--> statement-breakpoint
CREATE INDEX `site_domain_email_idx` ON `site_domain` (`supports_temp_email`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_domain_one_default_short_idx` ON `site_domain` (`is_default_short_domain`) WHERE "site_domain"."is_default_short_domain" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `site_domain_one_default_email_idx` ON `site_domain` (`is_default_email_domain`) WHERE "site_domain"."is_default_email_domain" = 1;--> statement-breakpoint
CREATE TABLE `site_setting` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`site_name` text DEFAULT 'Shortly' NOT NULL,
	`site_url` text DEFAULT '' NOT NULL,
	`telegram_bot_username` text DEFAULT '' NOT NULL,
	`user_max_links_per_hour` integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_binding` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_binding_user_id_idx` ON `telegram_binding` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_binding_chat_id_idx` ON `telegram_binding` (`chat_id`);--> statement-breakpoint
CREATE TABLE `temp_email_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`to_email` text NOT NULL,
	`message_id` text,
	`from` text NOT NULL,
	`from_name` text,
	`subject` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`reply_to_json` text DEFAULT '[]' NOT NULL,
	`headers_json` text DEFAULT '[]' NOT NULL,
	`failure_reason` text DEFAULT 'mailbox_not_found' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `temp_email_archive_message_id_idx` ON `temp_email_archive` (`message_id`);--> statement-breakpoint
CREATE INDEX `temp_email_archive_to_email_idx` ON `temp_email_archive` (`to_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `temp_email_archive_to_message_idx` ON `temp_email_archive` (`to_email`,`message_id`);--> statement-breakpoint
CREATE INDEX `temp_email_archive_received_at_idx` ON `temp_email_archive` (`received_at`);--> statement-breakpoint
CREATE TABLE `temp_email_archive_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`r2_path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`archive_id`) REFERENCES `temp_email_archive`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `temp_email_archive_attachment_archive_id_idx` ON `temp_email_archive_attachment` (`archive_id`);--> statement-breakpoint
CREATE TABLE `temp_email_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`r2_path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `temp_email_message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `temp_email_attachment_message_id_idx` ON `temp_email_attachment` (`message_id`);--> statement-breakpoint
CREATE TABLE `temp_email_message` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`message_id` text,
	`from` text NOT NULL,
	`from_name` text,
	`subject` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`reply_to_json` text DEFAULT '[]' NOT NULL,
	`headers_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `temp_mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `temp_email_message_mailbox_id_idx` ON `temp_email_message` (`mailbox_id`);--> statement-breakpoint
CREATE INDEX `temp_email_message_message_id_idx` ON `temp_email_message` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `temp_email_message_mailbox_message_idx` ON `temp_email_message` (`mailbox_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `temp_email_message_mailbox_received_idx` ON `temp_email_message` (`mailbox_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `temp_email_message_received_at_idx` ON `temp_email_message` (`received_at`);--> statement-breakpoint
CREATE TABLE `temp_mailbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email_address` text NOT NULL,
	`local_part` text NOT NULL,
	`domain` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `temp_mailbox_email_address_idx` ON `temp_mailbox` (`email_address`);--> statement-breakpoint
CREATE INDEX `temp_mailbox_user_id_idx` ON `temp_mailbox` (`user_id`);--> statement-breakpoint
CREATE INDEX `temp_mailbox_domain_idx` ON `temp_mailbox` (`domain`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `verification_expires_at_idx` ON `verification` (`expires_at`);