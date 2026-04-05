type DiagnosticLevel = "warn" | "error"

type DiagnosticInput = {
  scope: string
  event: string
  details?: Record<string, unknown>
  error?: unknown
  level?: DiagnosticLevel
}

export function getErrorMessage(error: unknown, fallback = "Unexpected error") {
  if (typeof error === "string" && error.trim()) {
    return error
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message
  }

  return fallback
}

export function reportDiagnostic({ scope, event, details, error, level = "error" }: DiagnosticInput) {
  const logger = level === "warn" ? console.warn : console.error
  logger(`[${scope}] ${event}`, {
    ...(details ?? {}),
    ...(error === undefined ? {} : { error }),
  })
}
