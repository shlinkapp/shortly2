import { db } from "@/lib/db"
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

export async function createLinkLog(input: CreateLinkLogInput) {
  try {
    await db.insert(linkLog).values({
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
    console.error("[link_log] failed to write event", error)
  }
}
