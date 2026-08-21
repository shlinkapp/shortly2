import { db } from "@/lib/db"
import { reportDiagnostic } from "@/lib/observability"
import { linkLog } from "@/lib/schema"

export type LinkLogEventType =
  | "link_created"
  | "link_created_api"
  | "redirect_success"
  | "redirect_blocked_expired"
  | "redirect_blocked_max_clicks"
  | "link_auto_deleted_expired"
  | "link_auto_deleted_max_clicks"
  | "link_manual_deleted_by_user"
  | "link_manual_deleted_by_admin"

interface CreateLinkLogInput {
  linkId: string | null
  linkSlug: string
  ownerUserId: string | null
  eventType: LinkLogEventType
  referrer?: string | null
  userAgent?: string | null
  ipAddress?: string | null
  statusCode?: number | null
}

type LinkLogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function reportLinkLogFailure(input: CreateLinkLogInput, error: unknown) {
  reportDiagnostic({
    scope: "link_log",
    event: "failed_to_write_event",
    details: {
      eventType: input.eventType,
      linkId: input.linkId,
      linkSlug: input.linkSlug,
      ownerUserId: input.ownerUserId,
      statusCode: input.statusCode ?? null,
    },
    error,
  })
}

/**
 * Write an audit log entry. Without a transaction this is best-effort (errors
 * are swallowed and reported). When a transaction is passed, the write joins
 * the caller's transaction and failures propagate so the whole operation
 * (e.g. deleting a link) rolls back instead of leaving a misleading log.
 */
export async function createLinkLog(input: CreateLinkLogInput, tx?: LinkLogTransaction) {
  const target = tx ?? db
  try {
    await target.insert(linkLog).values({
      id: crypto.randomUUID(),
      linkId: input.linkId,
      linkSlug: input.linkSlug,
      ownerUserId: input.ownerUserId,
      eventType: input.eventType,
      referrer: input.referrer ?? null,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      statusCode: input.statusCode ?? null,
    })
  } catch (error) {
    reportLinkLogFailure(input, error)
    if (tx) {
      throw error
    }
  }
}

export const linkLogWriter = {
  create: createLinkLog,
}

export const linkLogDiagnostics = {
  reportWriteFailure: reportLinkLogFailure,
}
