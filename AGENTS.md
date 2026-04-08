# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

- Install deps: `bun install`
- Start dev server: `bun run dev`
- Build production app: `bun run build`
- Start production server: `bun run start`
- Lint: `bun run lint`
- Run all tests: `bun run test`
- Run one test file: `bun test src/lib/slug.test.ts`
- Run tests matching a name: `bun test src/lib/slug.test.ts --test-name-pattern "rejects invalid urls"`
- Generate Drizzle migration files: `bun run db:generate`
- Push schema to the database: `bun run db:push`

## Stack

- Next.js 16 App Router with React 19
- Bun for package management and tests
- Drizzle ORM over libSQL/Turso
- Better Auth for session auth, GitHub OAuth, email OTP, and passkeys
- Tailwind CSS v4 + shadcn/ui for the UI

## Architecture

### App shape

- `src/app/page.tsx` is the public homepage. It resolves the current session server-side and renders `UrlShortener`.
- `src/app/dashboard/page.tsx` gates the signed-in user dashboard; `src/app/admin/page.tsx` gates the admin area.
- `src/app/[slug]/route.ts` handles the actual short-link redirect flow, including click counting, expiry checks, log writes, and auto-deletion of expired links.
- API routes live under `src/app/api/**` for browser/session-authenticated flows and under `src/app/v1/**` for API-key-based OpenAPI endpoints.
- Domain discovery endpoints live at `src/app/api/domains/route.ts` and `src/app/v1/domains/route.ts` and are used by the dashboard UI, homepage creator, and API docs.

### Data model

Core tables are defined in `src/lib/schema.ts`:
- Better Auth tables: `user`, `session`, `account`, `verification`, `passkey`
- Product tables: `short_link`, `link_log`, `site_setting`, `api_key`
- `click_log` exists in schema/init but current activity/history views use `link_log`

### Database bootstrapping

- `src/lib/db.ts` creates the libSQL client and Drizzle instance.
- `initDb()` is called from pages and route handlers before DB access. It creates tables/indexes on startup and backfills a few columns with `ensureColumn(...)`.
- Keep `src/lib/schema.ts` and the bootstrap SQL in `src/lib/db.ts` aligned when changing schema.

### Auth and roles

- `src/lib/auth.ts` configures Better Auth with the Drizzle adapter.
- Optional auth methods are enabled by env vars: Resend enables email OTP, GitHub env vars enable OAuth.
- Passkeys are always configured through the Better Auth passkey plugin.
- User roles are stored as an additional Better Auth field; `BOOTSTRAP_ADMIN_EMAILS` auto-promotes matching newly created users to `admin`.

### Link creation flows

There are two main creation paths:
- `src/app/api/shorten/route.ts`: browser flow using session auth and origin checks
- `src/app/v1/shorten/route.ts`: API-key flow for external clients

Both paths share the same core rules:
- validate URLs and slugs with helpers from `src/lib/slug.ts`
- block self-shortening with helpers in `src/lib/http.ts`
- enforce hourly limits through `src/lib/rate-limit.ts`
- compute expiration presets via `src/lib/short-link-expiration.ts`
- write audit-style events through `src/lib/link-logs.ts`

Anonymous browser users are restricted by `site_setting` values; signed-in users and API-key users can set `customSlug`, `maxClicks`, and `expiresIn`.

### Redirect and lifecycle behavior

- `src/app/[slug]/route.ts` is the source of truth for redirect behavior.
- A redirect first loads the link, derives status with `src/lib/link-status.ts`, logs blocked/expired cases, deletes links that have expired, then performs an atomic click increment before redirecting.
- If the atomic increment fails because the link expired concurrently, it re-reads and handles the expired state before returning.

### UI boundaries

- Server components do auth/session checks and pass minimal user data into client components.
- Main client surfaces:
  - `src/components/url-shortener.tsx` for homepage shortening
  - `src/components/short-link-creator.tsx` as the shared short-link creation UI used by both the homepage and dashboard
  - `src/components/temp-email-manager.tsx` for signed-in temp mailbox creation and inbox management
  - `src/app/dashboard/dashboard-client.tsx` for a user’s links, temp mail, logs, API keys, and passkeys
  - `src/app/admin/admin-client.tsx` for global link/user/settings/domain management
  - `src/components/api-management.tsx` for API key management, OpenAPI docs, ShareX config export, and domain discovery guidance
- Recent dashboard UX patterns:
  - keep desktop tables for dense data, but provide mobile card layouts for short links and temp mail
  - use confirmation dialogs for destructive actions like deleting links or email messages
  - prefer clear Chinese copy in user-facing dashboard flows and toasts
  - show stronger empty/loading states with next-step guidance rather than bare placeholders

### API keys

- API key helpers live in `src/lib/api-keys.ts`.
- Plain keys are only shown once at creation time.
- Stored records keep a prefix plus a SHA-256 hash of `rawKey:pepper`, where the pepper is `API_KEY_PEPPER` or `BETTER_AUTH_SECRET`.
- Session-authenticated key management endpoints are under `src/app/v1/keys/**`.

## Important configuration

The README documents the main env vars. The ones that affect behavior most are:
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `API_KEY_PEPPER`
- `BOOTSTRAP_ADMIN_EMAILS`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `TRUST_X_FORWARDED_FOR`, `TRUST_PROXY_HOPS`

## Notes for future edits

- Prefer updating shared logic in `src/lib/**` when changing behavior that exists in both browser and OpenAPI flows.
- If you change pagination or response shapes for dashboard/admin endpoints, check both the route handlers and the corresponding client components.
- This repo currently has no checked-in `.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`, or existing `AGENTS.md` to merge guidance from.

## Design Context

### Users

- Shortly is a public SaaS-style product for external users who need to shorten, share, and manage links quickly with minimal friction.
- The product also includes richer signed-in workflows for dashboard management, temporary email, API keys, and admin controls, so the UI should support both one-off utility and trustworthy account-based usage.

### Brand Personality

- Calm, professional, trustworthy.
- Beyond that baseline, the interface should also feel high-control and low-pressure: users should feel they can move quickly, understand consequences, and complete tasks without friction or visual noise.
- The interface should feel efficient and credible rather than playful or flashy.

### Aesthetic Direction

- Light mode first.
- Keep the current restrained, neutral shadcn-based direction with Geist typography, subtle borders, low-saturation surfaces, and clean hierarchy.
- Avoid bright or neon hues, crypto/startup-hype aesthetics, and glossy generic AI-template styling.
- Explicit anti-references: avoid AI SaaS template clichés, hacker/cyber-neon styling, overly heavy enterprise-admin visuals, and toy-like social-app energy.

### Design Principles

- Prioritize clarity over novelty — primary actions, status, and link data should read instantly.
- Build trust through restraint — use neutral color, disciplined spacing, and predictable patterns instead of visual hype.
- Create a sense of efficient control — users should feel they can act quickly without losing situational awareness.
- Keep flows lightweight — creation, copying, review, and admin tasks should feel fast, direct, and low-pressure.
- Design for operational readability — tables, badges, dialogs, and empty states should support scanning and decision-making.
- Use motion sparingly — prefer subtle transitions and avoid effects that add noise or discomfort.
- Reduced motion matters — do not rely on animation-heavy interactions.
- Avoid obvious template aesthetics — no glossy AI clichés, no cyber-security theatrics, no bloated enterprise heaviness, and no playful toy-app tone.
