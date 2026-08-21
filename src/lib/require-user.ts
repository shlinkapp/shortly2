import { auth } from "@/lib/auth"
import { headers } from "next/headers"

function isBanExpired(banExpires: Date | string | null | undefined): boolean {
  if (!banExpires) return false
  const time = banExpires instanceof Date ? banExpires.getTime() : new Date(banExpires).getTime()
  return Number.isFinite(time) && time <= Date.now()
}

/**
 * Resolve the current session while bypassing the session cookie cache and
 * re-checking the ban flag against the database.
 *
 * Better Auth's `cookieCache` serves sessions from a signed cookie for up to
 * `maxAge` (5 minutes) without touching the DB, and its cached payload is not
 * invalidated when an admin bans a user. This helper forces a fresh DB read on
 * every call so bans take effect immediately.
 */
export async function requireActiveUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  })
  if (!session) {
    return null
  }

  const user = session.user as { banned?: boolean; banExpires?: Date | string | null }
  if (user.banned && !isBanExpired(user.banExpires)) {
    return null
  }

  return session
}

export async function requireActiveAdmin() {
  const session = await requireActiveUser()
  if (!session) {
    return null
  }
  if ((session.user as { role?: string }).role !== "admin") {
    return null
  }
  return session
}
