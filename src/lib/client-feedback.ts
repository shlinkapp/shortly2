import { reportDiagnostic } from "@/lib/observability"

export function getUserFacingErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
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

export function getResponseErrorMessage(body: unknown, fallback: string) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim()
  ) {
    return body.error
  }

  return fallback
}

export async function readOptionalJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null)
}

export function createClientErrorReporter(scope: string) {
  return {
    report(event: string, error: unknown, details?: Record<string, unknown>) {
      reportDiagnostic({
        scope,
        event,
        details,
        error,
      })
    },
    warn(event: string, details?: Record<string, unknown>) {
      reportDiagnostic({
        scope,
        event,
        details,
        level: "warn",
      })
    },
  }
}
