# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two co-equal primary audiences:

- **Self-hosting operator** — a developer who deploys and runs their own Shortly instance (Next.js on their host, Turso/libSQL, Better Auth, optional Cloudflare Email Routing worker and Telegram bot worker, env configuration). They are both the person who sets it up and a heavy day-to-day user, and they also hold the `admin` role that governs global links, users, settings, and domains.
- **End users of an instance** — people using a deployed instance to shorten and share links, manage temporary mailboxes, and (when signed in) manage their own links, API keys, and passkeys. Ranges from one-off anonymous shorteners to signed-in account holders.

The interface must serve both one-off utility and trustworthy, account-based ongoing use. Neither audience is subordinate to the other.

## Product Purpose

Shortly is an open-source, lightweight, self-hostable system combining URL shortening and disposable/temporary email in one product. It lets users create and manage short links (with click counting, expiry, click caps, custom slugs) and provision temporary mailboxes that receive real inbound mail. Success is a fast, low-friction, trustworthy experience: creating and copying a link, or reading a temp-mail message, feels immediate, and operators can run and administer an instance with confidence.

## Positioning

Open-source and self-hostable by design. Two mechanisms distinguish it from a generic link shortener:

- It pairs short links **and** temporary email in a single self-hosted product, with real inbound-mail delivery via Cloudflare Email Routing plus optional Telegram push notification for new mail.
- It is operator-controlled: the deploying admin sets anonymous-user restrictions, domains, and site settings, while signed-in users and API-key clients get richer capabilities (custom slugs, max clicks, expiry).

## Operating Context

- **Deployment stack the operator manages:** Next.js 16 (App Router) instance, libSQL/Turso database (schema bootstrapped at runtime via `initDb()`), Better Auth, and two optional Cloudflare Workers in-repo — `.cf-email-forwarding-worker` (routes inbound mail to `POST /v1/emails/inbound`) and `.cf-tgbot-worker` (Telegram notifications). Resend and GitHub OAuth are optional, env-gated.
- **Two link-creation paths sharing core rules:** a browser/session flow (`/api/shorten`, origin-checked) and an API-key flow (`/v1/shorten`) for external clients, plus a ShareX config export.
- **Surfaces:** public homepage shortener, signed-in dashboard (links, temp mail, click logs, API keys, passkeys), and an admin console (global links, users, site settings, domains, email mailboxes/archives).
- **Redirect lifecycle:** `[slug]` route is the source of truth — derives link status, logs blocked/expired cases, auto-deletes expired links, then atomically increments clicks before redirecting.

## Capabilities and Constraints

- **Auth:** Better Auth session auth with GitHub OAuth, email OTP (Resend), and always-on passkeys. Roles (`user`/`admin`) are a Better Auth field; `BOOTSTRAP_ADMIN_EMAILS` auto-promotes matching new users.
- **Short links:** URL/slug validation, self-shortening blocked, hourly rate limits, expiration presets, custom slug / max-clicks / expiry for signed-in and API-key users. Anonymous users are constrained by `site_setting` values.
- **Temp email:** operator-provisioned mailboxes receive real inbound mail; new mail can trigger Telegram push.
- **API keys:** plain key shown once at creation; stored as prefix + SHA-256 of `rawKey:pepper`.
- **Constraints:** optional integrations are env-gated and may be absent in any given deployment; keep shared logic in `src/lib/**` aligned across browser and OpenAPI (`/v1`) flows; keep `src/lib/schema.ts` and the bootstrap SQL in `src/lib/db.ts` in sync.

## Language

Chinese-first. Simplified Chinese is the primary language for user-facing copy, labels, toasts, and empty/loading-state guidance. This is a durable product fact future work must honor; do not silently convert user-facing copy to English.

## Brand Commitments

- **Name:** Shortly.
- **Open-source positioning is fixed** — do not reframe as a paid or hosted-only SaaS, and preserve the self-hostable OSS nature.
- Recorded product-voice/aesthetic notes currently live in `AGENTS.md` ("Design Context"): calm, professional, trustworthy; efficient and credible over playful or flashy. Treated here as product-level voice intent; visual-world decisions belong to DESIGN.md / new-work, not this file.

## Evidence on Hand

- Real, working codebase: full Next.js app under `src/`, README (setup guide, zh), AGENTS.md (architecture + design context), and two Cloudflare Worker packages with their own docs.
- Icons/favicons in `public/` (favicon, apple-touch, android-chrome 192/512, browserconfig).
- **No real customers, testimonials, benchmarks, pricing, or usage/adoption numbers exist — future work must not fabricate any.** There is no paid tier or commercial claim to reference.

## Product Principles

- **Serve operator and end user equally** — admin/self-host workflows and everyday shortening/temp-mail use are both first-class; do not optimize one at the other's expense.
- **Trust through restraint and predictability** — clarity, disciplined patterns, and visible consequences over hype; this is a security-adjacent product.
- **Efficient control** — creating, copying, reviewing, and administering should feel fast, direct, and low-pressure without losing situational awareness.
- **Keep integrations optional-safe** — the UI and flows must degrade gracefully when Resend, GitHub, Telegram, or inbound-mail workers are not configured.
- **Chinese-first copy** — user-facing language stays clear and native in Simplified Chinese.
