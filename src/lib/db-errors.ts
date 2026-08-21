/**
 * Detect a SQLite/libSQL UNIQUE constraint violation without relying on the
 * (localized, unstable) error message alone. libSQL errors expose a stable
 * `code` such as "SQLITE_CONSTRAINT_UNIQUE".
 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (!error) return false

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "")
    if (code.includes("UNIQUE") || code.includes("SQLITE_CONSTRAINT")) {
      return true
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("UNIQUE constraint") ||
    message.includes("UNIQUE constraint failed") ||
    message.includes("UNIQUE")
  )
}
