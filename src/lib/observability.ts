type DiagnosticLevel = "warn" | "error"

type DiagnosticInput = {
  scope: string
  event: string
  details?: Record<string, unknown>
  error?: unknown
  level?: DiagnosticLevel
  /** Correlates related diagnostics; defaults to a fresh id per call. */
  requestId?: string
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

export function reportDiagnostic({ scope, event, details, error, level = "error", requestId }: DiagnosticInput) {
  const logger = level === "warn" ? console.warn : console.error
  logger(`[${scope}] ${event}`, {
    ...(details ?? {}),
    // Traceability across log lines without threading a request id everywhere.
    requestId: requestId ?? crypto.randomUUID(),
    ...(error === undefined ? {} : { error }),
  })
}
