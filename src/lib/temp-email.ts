import { and, desc, eq, like, or, sql } from "drizzle-orm"
import { after } from "next/server"
import { db } from "@/lib/db"
import { isUniqueConstraintError } from "@/lib/db-errors"
import {
  telegramBinding,
  tempMailbox,
  tempEmailArchive,
  tempEmailArchiveAttachment,
  tempEmailAttachment,
  tempEmailMessage,
  user,
} from "@/lib/schema"
import { getAllowedEmailDomain, parseDomainHost } from "@/lib/site-domains"
import { reportDiagnostic } from "@/lib/observability"
import { consumeRateLimit } from "@/lib/rate-limit"
import { sendInboundEmailTelegramNotification } from "@/lib/telegram"
import { isBlockedTempEmailPrefix } from "@/lib/temp-email-prefix"

function reportTempEmailWarning(event: string, details: Record<string, unknown>) {
  reportDiagnostic({
    scope: "temp_email",
    event,
    details,
    level: "warn",
  })
}

function reportTempEmailError(event: string, details: Record<string, unknown>, error: unknown) {
  reportDiagnostic({
    scope: "temp_email",
    event,
    details,
    error,
  })
}

function normalizeLocalPart(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
    return null
  }
  return normalized
}

export function parseEmailAddress(value: string): { localPart: string; domain: string } | null {
  const trimmed = value.trim().toLowerCase()
  const parts = trimmed.split("@")
  if (parts.length !== 2) return null

  const localPart = normalizeLocalPart(parts[0] || "")
  const domain = parseDomainHost(parts[1] || "")
  if (!localPart || !domain) return null

  return { localPart, domain }
}

function buildSearchTerm(search?: string | null) {
  const value = search?.trim().toLowerCase()
  if (!value) return null
  // Cap search length: unbounded `%term%` scans are already expensive, and a
  // giant search term only makes them worse.
  return `%${value.slice(0, 100)}%`
}

function buildEmailPreview(text: string | null | undefined, html: string | null | undefined, maxLength = 200) {
  const source = text?.trim() || html?.replace(/<[^>]+>/g, " ") || ""
  const collapsed = source.replace(/\s+/g, " ").trim()
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 3)}...` : collapsed
}

type InboundAttachment = {
  filename?: string
  mimeType?: string
  r2Path?: string
  size?: number
}

type InboundEmailPayload = {
  to: string
  from: string
  fromName?: string
  subject?: string
  text?: string
  html?: string
  date?: string
  messageId?: string
  cc?: string
  replyTo?: string
  headers?: string
  attachments?: InboundAttachment[]
}

type InboundMailboxRecord = {
  id: string
  userId: string
  emailAddress: string
}

type InboundEmailContext = {
  toEmail: string
  normalizedMessageId: string
  attachments: InboundAttachment[]
  receivedAt: Date
}

type TempMessageHeader = {
  name: string
  value: string
}

type TempMessageContact = {
  name?: string | null
  address?: string | null
}

type TempMessageAttachmentRecord = {
  id: string
  filename: string
  mimeType: string
  size: number
}

type CreateTempMailboxOptions = {
  hourlyCreateLimit?: number
}

async function listTempMessageAttachments(messageRowId: string): Promise<TempMessageAttachmentRecord[]> {
  return db
    .select({
      id: tempEmailAttachment.id,
      filename: tempEmailAttachment.filename,
      mimeType: tempEmailAttachment.mimeType,
      size: tempEmailAttachment.size,
    })
    .from(tempEmailAttachment)
    .where(eq(tempEmailAttachment.messageId, messageRowId))
    .orderBy(desc(tempEmailAttachment.createdAt))
}

async function listArchivedTempMessageAttachments(archiveId: string): Promise<TempMessageAttachmentRecord[]> {
  return db
    .select({
      id: tempEmailArchiveAttachment.id,
      filename: tempEmailArchiveAttachment.filename,
      mimeType: tempEmailArchiveAttachment.mimeType,
      size: tempEmailArchiveAttachment.size,
    })
    .from(tempEmailArchiveAttachment)
    .where(eq(tempEmailArchiveAttachment.archiveId, archiveId))
    .orderBy(desc(tempEmailArchiveAttachment.createdAt))
}

function parseStoredJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function normalizeAttachments(payload: InboundEmailPayload) {
  return Array.isArray(payload.attachments) ? payload.attachments : []
}

function normalizeReceivedAt(value?: string) {
  const receivedAt = value ? new Date(value) : new Date()
  return Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt
}

async function computeFallbackMessageId(payload: InboundEmailPayload): Promise<string> {
  const source = [payload.from, payload.to, payload.subject, payload.date]
    .map((part) => part ?? "")
    .join("\u0000")
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `sha256:${hex.slice(0, 32)}`
}

async function buildInboundEmailContext(payload: InboundEmailPayload): Promise<InboundEmailContext> {
  // Emails without a Message-ID get a deterministic fallback key derived from
  // from/to/subject/date so retries still deduplicate (the unique index treats
  // NULL as distinct, so an empty messageId could never collide).
  const normalizedMessageId = payload.messageId?.trim() || (await computeFallbackMessageId(payload))

  return {
    toEmail: payload.to.trim().toLowerCase(),
    normalizedMessageId,
    attachments: normalizeAttachments(payload),
    receivedAt: normalizeReceivedAt(payload.date),
  }
}

function buildStoredAttachment(attachment: InboundAttachment) {
  return {
    id: crypto.randomUUID(),
    filename: attachment.filename?.trim() || "untitled",
    mimeType: attachment.mimeType?.trim() || "application/octet-stream",
    r2Path: attachment.r2Path?.trim() || "",
    size: Number.isFinite(attachment.size) ? Math.max(0, Math.floor(attachment.size ?? 0)) : 0,
    createdAt: new Date(),
  }
}

type TempEmailTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function insertEmailAttachments(
  tx: TempEmailTransaction,
  messageId: string,
  attachments: InboundAttachment[]
) {
  if (attachments.length === 0) {
    return
  }

  await tx.insert(tempEmailAttachment).values(
    attachments.map((attachment) => ({
      ...buildStoredAttachment(attachment),
      messageId,
    }))
  )
}

async function findInboundMailbox(toEmail: string) {
  return db
    .select({ id: tempMailbox.id, userId: tempMailbox.userId, emailAddress: tempMailbox.emailAddress })
    .from(tempMailbox)
    .where(eq(tempMailbox.emailAddress, toEmail))
    .get()
}

async function findDuplicateArchivedInboundEmail(toEmail: string, normalizedMessageId: string) {
  return db
    .select({ id: tempEmailArchive.id })
    .from(tempEmailArchive)
    .where(and(eq(tempEmailArchive.toEmail, toEmail), eq(tempEmailArchive.messageId, normalizedMessageId)))
    .get()
}

async function findDuplicateMailboxMessage(mailboxId: string, normalizedMessageId: string) {
  return db
    .select({ id: tempEmailMessage.id })
    .from(tempEmailMessage)
    .where(and(eq(tempEmailMessage.mailboxId, mailboxId), eq(tempEmailMessage.messageId, normalizedMessageId)))
    .get()
}

async function archiveInboundEmail(payload: InboundEmailPayload, context: InboundEmailContext) {
  try {
    // Message + attachments are written in one transaction; the unique index on
    // (to_email, message_id) is the concurrency backstop for the read-then-insert.
    const result = await db.transaction(async (tx) => {
      const duplicate = await tx
        .select({ id: tempEmailArchive.id })
        .from(tempEmailArchive)
        .where(and(
          eq(tempEmailArchive.toEmail, context.toEmail),
          eq(tempEmailArchive.messageId, context.normalizedMessageId)
        ))
        .get()

      if (duplicate) {
        return { archiveId: duplicate.id, duplicated: true }
      }

      const archiveId = crypto.randomUUID()
      await tx.insert(tempEmailArchive).values({
        id: archiveId,
        toEmail: context.toEmail,
        messageId: context.normalizedMessageId,
        from: payload.from,
        fromName: payload.fromName?.trim() || null,
        subject: payload.subject?.trim() || "",
        text: payload.text || "",
        html: payload.html || "",
        receivedAt: context.receivedAt,
        ccJson: payload.cc || "[]",
        replyToJson: payload.replyTo || "[]",
        headersJson: payload.headers || "[]",
        failureReason: "mailbox_not_found",
        createdAt: new Date(),
      })
      await insertArchiveAttachments(tx, archiveId, context.attachments)

      return { archiveId, duplicated: false }
    })

    return { data: { archiveId: result.archiveId, duplicated: result.duplicated, archived: true } }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await findDuplicateArchivedInboundEmail(context.toEmail, context.normalizedMessageId)
      if (duplicate) {
        return { data: { archiveId: duplicate.id, duplicated: true, archived: true } }
      }
    }
    throw error
  }
}

async function deliverInboundEmailToMailbox(
  mailbox: InboundMailboxRecord,
  payload: InboundEmailPayload,
  context: InboundEmailContext
) {
  let delivered: { messageRowId: string; duplicated: boolean }

  try {
    const result = await db.transaction(async (tx) => {
      const duplicate = await tx
        .select({ id: tempEmailMessage.id })
        .from(tempEmailMessage)
        .where(and(
          eq(tempEmailMessage.mailboxId, mailbox.id),
          eq(tempEmailMessage.messageId, context.normalizedMessageId)
        ))
        .get()

      if (duplicate) {
        return { messageRowId: duplicate.id, duplicated: true }
      }

      const messageRowId = crypto.randomUUID()
      await tx.insert(tempEmailMessage).values({
        id: messageRowId,
        mailboxId: mailbox.id,
        messageId: context.normalizedMessageId,
        from: payload.from,
        fromName: payload.fromName?.trim() || null,
        subject: payload.subject?.trim() || "",
        text: payload.text || "",
        html: payload.html || "",
        receivedAt: context.receivedAt,
        isRead: false,
        ccJson: payload.cc || "[]",
        replyToJson: payload.replyTo || "[]",
        headersJson: payload.headers || "[]",
        createdAt: new Date(),
      })
      await insertEmailAttachments(tx, messageRowId, context.attachments)

      return { messageRowId, duplicated: false }
    })

    delivered = result
  } catch (error) {
    // A concurrent delivery of the same message may have won the race against
    // our unique index: fall back to a read and report it as a duplicate
    // instead of surfacing a 5xx to the worker.
    if (isUniqueConstraintError(error)) {
      const duplicate = await findDuplicateMailboxMessage(mailbox.id, context.normalizedMessageId)
      if (duplicate) {
        return { data: { mailboxId: mailbox.id, messageId: duplicate.id, duplicated: true, archived: false } }
      }
    }
    throw error
  }

  if (!delivered.duplicated) {
    scheduleTelegramNotification(mailbox, payload, context.attachments, delivered.messageRowId)
  }

  return {
    data: {
      mailboxId: mailbox.id,
      messageId: delivered.messageRowId,
      duplicated: delivered.duplicated,
      archived: false,
    },
  }
}

function scheduleTelegramNotification(
  mailbox: { userId: string; emailAddress: string },
  payload: InboundEmailPayload,
  attachments: InboundAttachment[],
  messageRowId: string
) {
  const run = () =>
    notifyMailboxOwnerOnTelegram(mailbox, payload, attachments, messageRowId).catch((error) => {
      reportTempEmailError(
        "telegram_notification_failed_async",
        {
          userId: mailbox.userId,
          emailAddress: mailbox.emailAddress,
          messageId: payload.messageId?.trim() || null,
        },
        error
      )
    })

  try {
    // Run after the response is sent so a slow Telegram call never blocks the
    // inbound delivery (the worker itself would otherwise time out and retry).
    after(run)
  } catch {
    // Outside a request scope (e.g. a test or background job): fire and forget.
    void run()
  }
}

async function insertArchiveAttachments(
  tx: TempEmailTransaction,
  archiveId: string,
  attachments: InboundAttachment[]
) {
  if (attachments.length === 0) {
    return
  }

  await tx.insert(tempEmailArchiveAttachment).values(
    attachments.map((attachment) => ({
      ...buildStoredAttachment(attachment),
      archiveId,
    }))
  )
}

async function notifyMailboxOwnerOnTelegram(
  mailbox: { userId: string; emailAddress: string },
  payload: InboundEmailPayload,
  attachments: InboundAttachment[],
  messageRowId: string
) {
  try {
    const binding = await db
      .select({ chatId: telegramBinding.chatId })
      .from(telegramBinding)
      .where(eq(telegramBinding.userId, mailbox.userId))
      .get()

    if (!binding?.chatId) {
      return
    }

    if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      reportTempEmailWarning("telegram_notification_skipped", {
        reason: "missing_bot_token",
        userId: mailbox.userId,
        emailAddress: mailbox.emailAddress,
      })
      return
    }

    await sendInboundEmailTelegramNotification({
      chatId: binding.chatId,
      messageId: messageRowId,
      emailAddress: mailbox.emailAddress,
      from: payload.from,
      fromName: payload.fromName,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachmentsCount: attachments.length,
    })
  } catch (error) {
    reportTempEmailError(
      "telegram_notification_failed",
      {
        userId: mailbox.userId,
        emailAddress: mailbox.emailAddress,
        messageId: payload.messageId?.trim() || null,
      },
      error
    )
  }
}


export async function createTempMailboxForUser(
  userId: string,
  emailAddress: string,
  options?: CreateTempMailboxOptions
) {
  const parsed = parseEmailAddress(emailAddress)
  if (!parsed) {
    return { error: "Invalid email address", status: 400 as const }
  }

  if (isBlockedTempEmailPrefix(parsed.localPart)) {
    return { error: "该邮箱前缀为系统保留词，请更换前缀", status: 400 as const }
  }

  const allowedDomain = await getAllowedEmailDomain(parsed.domain)
  if (!allowedDomain) {
    return { error: "This email domain is not enabled", status: 400 as const }
  }

  if (parsed.localPart.length < allowedDomain.minLocalPartLength) {
    return { error: `邮箱前缀至少需要 ${allowedDomain.minLocalPartLength} 个字符`, status: 400 as const }
  }

  const finalEmailAddress = `${parsed.localPart}@${allowedDomain.host}`
  const existing = await db
    .select({ id: tempMailbox.id })
    .from(tempMailbox)
    .where(eq(tempMailbox.emailAddress, finalEmailAddress))
    .get()

  if (existing) {
    return { error: "This email address already exists", status: 409 as const }
  }

  const normalizedHourlyLimit = Number.isFinite(options?.hourlyCreateLimit)
    ? Math.max(1, Math.floor(options?.hourlyCreateLimit ?? 1))
    : null
  if (normalizedHourlyLimit) {
    // Atomic fixed-window counter: concurrent create requests cannot all pass
    // the limit check the way a read-then-insert count would allow.
    const rateLimitResult = await consumeRateLimit(`mailbox:create:${userId}`, normalizedHourlyLimit)
    if (!rateLimitResult.success) {
      return {
        error: `每小时最多创建 ${normalizedHourlyLimit} 个临时邮箱，请稍后再试`,
        status: 429 as const,
      }
    }
  }

  const id = crypto.randomUUID()
  const createdAt = new Date()
  try {
    await db.insert(tempMailbox).values({
      id,
      userId,
      emailAddress: finalEmailAddress,
      localPart: parsed.localPart,
      domain: allowedDomain.host,
      isActive: true,
      createdAt,
    })
  } catch (error) {
    // A concurrent request may have created the same address between our
    // existence check and the insert: surface 409, never a 500.
    if (isUniqueConstraintError(error)) {
      return { error: "This email address already exists", status: 409 as const }
    }
    throw error
  }

  return {
    data: {
      id,
      emailAddress: finalEmailAddress,
      localPart: parsed.localPart,
      domain: allowedDomain.host,
      createdAt,
    },
  }
}

export async function listTempMailboxesForUser(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit
  const [totalRes, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tempMailbox).where(eq(tempMailbox.userId, userId)).get(),
    db
      .select({
        id: tempMailbox.id,
        emailAddress: tempMailbox.emailAddress,
        domain: tempMailbox.domain,
        createdAt: tempMailbox.createdAt,
        unreadCount: sql<number>`coalesce(sum(case when ${tempEmailMessage.isRead} = 0 then 1 else 0 end), 0)`,
        messageCount: sql<number>`count(${tempEmailMessage.id})`,
      })
      .from(tempMailbox)
      .leftJoin(tempEmailMessage, eq(tempEmailMessage.mailboxId, tempMailbox.id))
      .where(eq(tempMailbox.userId, userId))
      .groupBy(tempMailbox.id)
      .orderBy(desc(tempMailbox.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0
  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function listTempMailboxOptionsForUser(userId: string) {
  return db
    .select({
      id: tempMailbox.id,
      emailAddress: tempMailbox.emailAddress,
      domain: tempMailbox.domain,
      createdAt: tempMailbox.createdAt,
      unreadCount: sql<number>`coalesce(sum(case when ${tempEmailMessage.isRead} = 0 then 1 else 0 end), 0)`,
      messageCount: sql<number>`count(${tempEmailMessage.id})`,
    })
    .from(tempMailbox)
    .leftJoin(tempEmailMessage, eq(tempEmailMessage.mailboxId, tempMailbox.id))
    .where(eq(tempMailbox.userId, userId))
    .groupBy(tempMailbox.id)
    .orderBy(desc(tempMailbox.createdAt))
}

export async function listTempMessagesForUser(
  userId: string,
  page: number,
  limit: number,
  options?: { search?: string | null; mailboxId?: string | null }
) {
  const offset = (page - 1) * limit
  const searchTerm = buildSearchTerm(options?.search)
  const whereClause = and(
    eq(tempMailbox.userId, userId),
    options?.mailboxId ? eq(tempMailbox.id, options.mailboxId) : undefined,
    searchTerm
      ? or(
        like(tempMailbox.emailAddress, searchTerm),
        like(tempEmailMessage.subject, searchTerm),
        like(tempEmailMessage.from, searchTerm),
        like(tempEmailMessage.fromName, searchTerm)
      )
      : undefined
  )

  const [totalRes, unreadRes, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(tempEmailMessage)
      .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
      .where(whereClause)
      .get(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(tempEmailMessage)
      .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
      .where(and(whereClause, eq(tempEmailMessage.isRead, false)))
      .get(),
    db
      .select({
        id: tempEmailMessage.id,
        mailboxId: tempMailbox.id,
        mailboxEmailAddress: tempMailbox.emailAddress,
        messageId: tempEmailMessage.messageId,
        from: tempEmailMessage.from,
        fromName: tempEmailMessage.fromName,
        subject: tempEmailMessage.subject,
        textPreview: sql<string>`substr(${tempEmailMessage.text}, 1, 300)`,
        htmlPreview: sql<string>`substr(${tempEmailMessage.html}, 1, 500)`,
        receivedAt: tempEmailMessage.receivedAt,
        isRead: tempEmailMessage.isRead,
        hasAttachments: sql<number>`exists(select 1 from temp_email_attachment a where a.message_id = ${tempEmailMessage.id})`,
      })
      .from(tempEmailMessage)
      .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
      .where(whereClause)
      .orderBy(desc(tempEmailMessage.receivedAt), desc(tempEmailMessage.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0
  return {
    data: rows.map((row) => ({
      id: row.id,
      mailboxId: row.mailboxId,
      mailboxEmailAddress: row.mailboxEmailAddress,
      messageId: row.messageId,
      from: row.from,
      fromName: row.fromName,
      subject: row.subject,
      preview: buildEmailPreview(row.textPreview, row.htmlPreview),
      receivedAt: row.receivedAt,
      isRead: row.isRead,
      hasAttachments: Boolean(row.hasAttachments),
    })),
    total,
    unread: unreadRes?.count ?? 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function listTempMessagesForMailbox(userId: string, mailboxId: string, page: number, limit: number) {
  const mailbox = await db
    .select({ id: tempMailbox.id, emailAddress: tempMailbox.emailAddress })
    .from(tempMailbox)
    .where(and(eq(tempMailbox.id, mailboxId), eq(tempMailbox.userId, userId)))
    .get()

  if (!mailbox) {
    return null
  }

  const offset = (page - 1) * limit
  const [totalRes, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tempEmailMessage).where(eq(tempEmailMessage.mailboxId, mailboxId)).get(),
    db
      .select({
        id: tempEmailMessage.id,
        messageId: tempEmailMessage.messageId,
        from: tempEmailMessage.from,
        fromName: tempEmailMessage.fromName,
        subject: tempEmailMessage.subject,
        text: tempEmailMessage.text,
        html: tempEmailMessage.html,
        receivedAt: tempEmailMessage.receivedAt,
        isRead: tempEmailMessage.isRead,
        hasAttachments: sql<number>`exists(select 1 from temp_email_attachment a where a.message_id = ${tempEmailMessage.id})`,
      })
      .from(tempEmailMessage)
      .where(eq(tempEmailMessage.mailboxId, mailboxId))
      .orderBy(desc(tempEmailMessage.receivedAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0
  return {
    mailbox,
    data: rows.map((row) => ({ ...row, hasAttachments: Boolean(row.hasAttachments) })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function getTempMessageDetail(userId: string, messageRowId: string) {
  const message = await db
    .select({
      id: tempEmailMessage.id,
      mailboxId: tempEmailMessage.mailboxId,
      mailboxEmailAddress: tempMailbox.emailAddress,
      messageId: tempEmailMessage.messageId,
      from: tempEmailMessage.from,
      fromName: tempEmailMessage.fromName,
      subject: tempEmailMessage.subject,
      text: tempEmailMessage.text,
      html: tempEmailMessage.html,
      receivedAt: tempEmailMessage.receivedAt,
      isRead: tempEmailMessage.isRead,
      ccJson: tempEmailMessage.ccJson,
      replyToJson: tempEmailMessage.replyToJson,
      headersJson: tempEmailMessage.headersJson,
    })
    .from(tempEmailMessage)
    .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
    .where(and(eq(tempEmailMessage.id, messageRowId), eq(tempMailbox.userId, userId)))
    .get()

  if (!message) {
    return null
  }

  const attachments = await listTempMessageAttachments(messageRowId)
  const text = message.text || ""
  const html = message.html || ""

  return {
    id: message.id,
    mailboxId: message.mailboxId,
    mailboxEmailAddress: message.mailboxEmailAddress,
    messageId: message.messageId,
    from: message.from,
    fromName: message.fromName,
    subject: message.subject,
    text,
    html,
    receivedAt: message.receivedAt,
    isRead: message.isRead,
    cc: parseStoredJsonArray<TempMessageContact>(message.ccJson),
    replyTo: parseStoredJsonArray<TempMessageContact>(message.replyToJson),
    headers: parseStoredJsonArray<TempMessageHeader>(message.headersJson),
    attachments,
    hasText: Boolean(text.trim()),
    hasHtml: Boolean(html.trim()),
    hasAttachments: attachments.length > 0,
  }
}

export async function getAdminTempMessageDetail(messageRowId: string) {
  const message = await db
    .select({
      id: tempEmailMessage.id,
      mailboxId: tempEmailMessage.mailboxId,
      mailboxEmailAddress: tempMailbox.emailAddress,
      userId: tempMailbox.userId,
      userName: user.name,
      userEmail: user.email,
      messageId: tempEmailMessage.messageId,
      from: tempEmailMessage.from,
      fromName: tempEmailMessage.fromName,
      subject: tempEmailMessage.subject,
      text: tempEmailMessage.text,
      html: tempEmailMessage.html,
      receivedAt: tempEmailMessage.receivedAt,
      isRead: tempEmailMessage.isRead,
      ccJson: tempEmailMessage.ccJson,
      replyToJson: tempEmailMessage.replyToJson,
      headersJson: tempEmailMessage.headersJson,
    })
    .from(tempEmailMessage)
    .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
    .leftJoin(user, eq(user.id, tempMailbox.userId))
    .where(eq(tempEmailMessage.id, messageRowId))
    .get()

  if (!message) {
    return null
  }

  const attachments = await listTempMessageAttachments(messageRowId)
  const text = message.text || ""
  const html = message.html || ""

  return {
    id: message.id,
    mailboxId: message.mailboxId,
    mailboxEmailAddress: message.mailboxEmailAddress,
    userId: message.userId,
    userName: message.userName,
    userEmail: message.userEmail,
    messageId: message.messageId,
    from: message.from,
    fromName: message.fromName,
    subject: message.subject,
    text,
    html,
    receivedAt: message.receivedAt,
    isRead: message.isRead,
    cc: parseStoredJsonArray<TempMessageContact>(message.ccJson),
    replyTo: parseStoredJsonArray<TempMessageContact>(message.replyToJson),
    headers: parseStoredJsonArray<TempMessageHeader>(message.headersJson),
    attachments,
    hasText: Boolean(text.trim()),
    hasHtml: Boolean(html.trim()),
    hasAttachments: attachments.length > 0,
  }
}

export async function getAdminArchivedTempMessageDetail(archiveId: string) {
  const archive = await db
    .select({
      id: tempEmailArchive.id,
      toEmail: tempEmailArchive.toEmail,
      messageId: tempEmailArchive.messageId,
      from: tempEmailArchive.from,
      fromName: tempEmailArchive.fromName,
      subject: tempEmailArchive.subject,
      text: tempEmailArchive.text,
      html: tempEmailArchive.html,
      receivedAt: tempEmailArchive.receivedAt,
      ccJson: tempEmailArchive.ccJson,
      replyToJson: tempEmailArchive.replyToJson,
      headersJson: tempEmailArchive.headersJson,
      failureReason: tempEmailArchive.failureReason,
    })
    .from(tempEmailArchive)
    .where(eq(tempEmailArchive.id, archiveId))
    .get()

  if (!archive) {
    return null
  }

  const attachments = await listArchivedTempMessageAttachments(archiveId)
  const text = archive.text || ""
  const html = archive.html || ""

  return {
    id: archive.id,
    toEmail: archive.toEmail,
    messageId: archive.messageId,
    from: archive.from,
    fromName: archive.fromName,
    subject: archive.subject,
    text,
    html,
    receivedAt: archive.receivedAt,
    cc: parseStoredJsonArray<TempMessageContact>(archive.ccJson),
    replyTo: parseStoredJsonArray<TempMessageContact>(archive.replyToJson),
    headers: parseStoredJsonArray<TempMessageHeader>(archive.headersJson),
    attachments,
    failureReason: archive.failureReason,
    hasText: Boolean(text.trim()),
    hasHtml: Boolean(html.trim()),
    hasAttachments: attachments.length > 0,
  }
}

export async function markTempMessageRead(userId: string, messageRowId: string) {
  const message = await db
    .select({ id: tempEmailMessage.id })
    .from(tempEmailMessage)
    .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
    .where(and(eq(tempEmailMessage.id, messageRowId), eq(tempMailbox.userId, userId)))
    .get()

  if (!message) {
    return false
  }

  await db.update(tempEmailMessage).set({ isRead: true }).where(eq(tempEmailMessage.id, messageRowId))
  return true
}

export async function deleteTempMessage(userId: string, messageRowId: string) {
  const message = await db
    .select({ id: tempEmailMessage.id })
    .from(tempEmailMessage)
    .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
    .where(and(eq(tempEmailMessage.id, messageRowId), eq(tempMailbox.userId, userId)))
    .get()

  if (!message) {
    return false
  }

  await db.delete(tempEmailMessage).where(eq(tempEmailMessage.id, messageRowId))
  return true
}

export async function deleteTempMailbox(userId: string, mailboxId: string) {
  const parsedEmail = parseEmailAddress(mailboxId)
  const mailboxSelector = parsedEmail
    ? eq(tempMailbox.emailAddress, `${parsedEmail.localPart}@${parsedEmail.domain}`)
    : eq(tempMailbox.id, mailboxId)
  const mailbox = await db
    .select({ id: tempMailbox.id })
    .from(tempMailbox)
    .where(and(mailboxSelector, eq(tempMailbox.userId, userId)))
    .get()

  if (!mailbox) {
    return false
  }

  await db.delete(tempMailbox).where(eq(tempMailbox.id, mailbox.id))
  return true
}

export async function storeInboundEmail(payload: InboundEmailPayload) {
  const context = await buildInboundEmailContext(payload)
  const mailbox = await findInboundMailbox(context.toEmail)

  if (!mailbox) {
    return archiveInboundEmail(payload, context)
  }

  return deliverInboundEmailToMailbox(mailbox, payload, context)
}

export async function listAllTempMailboxes(page: number, limit: number, search?: string | null) {
  const offset = (page - 1) * limit
  const searchTerm = buildSearchTerm(search)
  const whereClause = searchTerm
    ? or(
      like(tempMailbox.emailAddress, searchTerm),
      like(user.email, searchTerm),
      like(user.name, searchTerm)
    )
    : undefined

  const [totalRes, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(tempMailbox)
      .leftJoin(user, eq(user.id, tempMailbox.userId))
      .where(whereClause)
      .get(),
    db
      .select({
        id: tempMailbox.id,
        emailAddress: tempMailbox.emailAddress,
        domain: tempMailbox.domain,
        isActive: tempMailbox.isActive,
        createdAt: tempMailbox.createdAt,
        userId: tempMailbox.userId,
        userName: user.name,
        userEmail: user.email,
        unreadCount: sql<number>`coalesce(sum(case when ${tempEmailMessage.isRead} = 0 then 1 else 0 end), 0)`,
        messageCount: sql<number>`count(${tempEmailMessage.id})`,
      })
      .from(tempMailbox)
      .leftJoin(user, eq(user.id, tempMailbox.userId))
      .leftJoin(tempEmailMessage, eq(tempEmailMessage.mailboxId, tempMailbox.id))
      .where(whereClause)
      .groupBy(tempMailbox.id, user.id)
      .orderBy(desc(tempMailbox.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0
  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function listAllTempMessages(page: number, limit: number, search?: string | null) {
  const offset = (page - 1) * limit
  const searchTerm = buildSearchTerm(search)
  const whereClause = searchTerm
    ? or(
      like(tempMailbox.emailAddress, searchTerm),
      like(tempEmailMessage.subject, searchTerm),
      like(tempEmailMessage.from, searchTerm),
      like(user.email, searchTerm),
      like(user.name, searchTerm)
    )
    : undefined

  const [totalRes, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(tempEmailMessage)
      .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
      .leftJoin(user, eq(user.id, tempMailbox.userId))
      .where(whereClause)
      .get(),
    db
      .select({
        id: tempEmailMessage.id,
        mailboxId: tempMailbox.id,
        mailboxEmailAddress: tempMailbox.emailAddress,
        userId: tempMailbox.userId,
        userName: user.name,
        userEmail: user.email,
        messageId: tempEmailMessage.messageId,
        from: tempEmailMessage.from,
        fromName: tempEmailMessage.fromName,
        subject: tempEmailMessage.subject,
        textPreview: sql<string>`substr(${tempEmailMessage.text}, 1, 300)`,
        htmlPreview: sql<string>`substr(${tempEmailMessage.html}, 1, 500)`,
        receivedAt: tempEmailMessage.receivedAt,
        isRead: tempEmailMessage.isRead,
        hasAttachments: sql<number>`exists(select 1 from temp_email_attachment a where a.message_id = ${tempEmailMessage.id})`,
      })
      .from(tempEmailMessage)
      .innerJoin(tempMailbox, eq(tempMailbox.id, tempEmailMessage.mailboxId))
      .leftJoin(user, eq(user.id, tempMailbox.userId))
      .where(whereClause)
      .orderBy(desc(tempEmailMessage.receivedAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0
  return {
    data: rows.map((row) => ({
      id: row.id,
      mailboxId: row.mailboxId,
      mailboxEmailAddress: row.mailboxEmailAddress,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      messageId: row.messageId,
      from: row.from,
      fromName: row.fromName,
      subject: row.subject,
      preview: buildEmailPreview(row.textPreview, row.htmlPreview),
      receivedAt: row.receivedAt,
      isRead: row.isRead,
      hasAttachments: Boolean(row.hasAttachments),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function listArchivedInboundEmails(page: number, limit: number, search?: string | null) {
  const offset = (page - 1) * limit
  const searchTerm = buildSearchTerm(search)
  const whereClause = searchTerm
    ? or(
      like(tempEmailArchive.toEmail, searchTerm),
      like(tempEmailArchive.subject, searchTerm),
      like(tempEmailArchive.from, searchTerm),
      like(tempEmailArchive.failureReason, searchTerm)
    )
    : undefined

  const [totalRes, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tempEmailArchive).where(whereClause).get(),
    db
      .select({
        id: tempEmailArchive.id,
        toEmail: tempEmailArchive.toEmail,
        messageId: tempEmailArchive.messageId,
        from: tempEmailArchive.from,
        fromName: tempEmailArchive.fromName,
        subject: tempEmailArchive.subject,
        textPreview: sql<string>`substr(${tempEmailArchive.text}, 1, 300)`,
        htmlPreview: sql<string>`substr(${tempEmailArchive.html}, 1, 500)`,
        receivedAt: tempEmailArchive.receivedAt,
        failureReason: tempEmailArchive.failureReason,
        hasAttachments: sql<number>`exists(select 1 from temp_email_archive_attachment a where a.archive_id = ${tempEmailArchive.id})`,
      })
      .from(tempEmailArchive)
      .where(whereClause)
      .orderBy(desc(tempEmailArchive.receivedAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = totalRes?.count ?? 0
  return {
    data: rows.map((row) => ({
      id: row.id,
      toEmail: row.toEmail,
      messageId: row.messageId,
      from: row.from,
      fromName: row.fromName,
      subject: row.subject,
      preview: buildEmailPreview(row.textPreview, row.htmlPreview),
      receivedAt: row.receivedAt,
      failureReason: row.failureReason,
      hasAttachments: Boolean(row.hasAttachments),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
