import { and, desc, eq, like, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  tempMailbox,
  tempEmailArchive,
  tempEmailArchiveAttachment,
  tempEmailAttachment,
  tempEmailMessage,
  user,
} from "@/lib/schema"
import { getAllowedEmailDomain, parseDomainHost } from "@/lib/site-domains"

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
  return value ? `%${value}%` : null
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

function normalizeAttachments(payload: InboundEmailPayload) {
  return Array.isArray(payload.attachments) ? payload.attachments : []
}

function normalizeReceivedAt(value?: string) {
  const receivedAt = value ? new Date(value) : new Date()
  return Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt
}

async function insertEmailAttachments(messageId: string, attachments: InboundAttachment[]) {
  if (attachments.length === 0) {
    return
  }

  await db.insert(tempEmailAttachment).values(
    attachments.map((attachment) => ({
      id: crypto.randomUUID(),
      messageId,
      filename: attachment.filename?.trim() || "untitled",
      mimeType: attachment.mimeType?.trim() || "application/octet-stream",
      r2Path: attachment.r2Path?.trim() || "",
      size: Number.isFinite(attachment.size) ? Math.max(0, Math.floor(attachment.size ?? 0)) : 0,
      createdAt: new Date(),
    }))
  )
}

async function insertArchiveAttachments(archiveId: string, attachments: InboundAttachment[]) {
  if (attachments.length === 0) {
    return
  }

  await db.insert(tempEmailArchiveAttachment).values(
    attachments.map((attachment) => ({
      id: crypto.randomUUID(),
      archiveId,
      filename: attachment.filename?.trim() || "untitled",
      mimeType: attachment.mimeType?.trim() || "application/octet-stream",
      r2Path: attachment.r2Path?.trim() || "",
      size: Number.isFinite(attachment.size) ? Math.max(0, Math.floor(attachment.size ?? 0)) : 0,
      createdAt: new Date(),
    }))
  )
}

export async function createTempMailboxForUser(userId: string, emailAddress: string) {
  const parsed = parseEmailAddress(emailAddress)
  if (!parsed) {
    return { error: "Invalid email address" as const }
  }

  const allowedDomain = await getAllowedEmailDomain(parsed.domain)
  if (!allowedDomain) {
    return { error: "This email domain is not enabled" as const }
  }

  const finalEmailAddress = `${parsed.localPart}@${allowedDomain.host}`
  const existing = await db
    .select({ id: tempMailbox.id })
    .from(tempMailbox)
    .where(eq(tempMailbox.emailAddress, finalEmailAddress))
    .get()

  if (existing) {
    return { error: "This email address already exists" as const }
  }

  const id = crypto.randomUUID()
  const createdAt = new Date()
  await db.insert(tempMailbox).values({
    id,
    userId,
    emailAddress: finalEmailAddress,
    localPart: parsed.localPart,
    domain: allowedDomain.host,
    isActive: true,
    createdAt,
  })

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
  const mailbox = await db
    .select({ id: tempMailbox.id })
    .from(tempMailbox)
    .where(and(eq(tempMailbox.id, mailboxId), eq(tempMailbox.userId, userId)))
    .get()

  if (!mailbox) {
    return false
  }

  await db.delete(tempMailbox).where(eq(tempMailbox.id, mailboxId))
  return true
}

export async function storeInboundEmail(payload: InboundEmailPayload) {
  const toEmail = payload.to.trim().toLowerCase()
  const mailbox = await db
    .select({ id: tempMailbox.id, userId: tempMailbox.userId, emailAddress: tempMailbox.emailAddress })
    .from(tempMailbox)
    .where(eq(tempMailbox.emailAddress, toEmail))
    .get()

  const attachments = normalizeAttachments(payload)
  const receivedAt = normalizeReceivedAt(payload.date)
  const normalizedMessageId = payload.messageId?.trim() || null

  if (!mailbox) {
    const duplicateArchive = normalizedMessageId
      ? await db
        .select({ id: tempEmailArchive.id })
        .from(tempEmailArchive)
        .where(and(eq(tempEmailArchive.toEmail, toEmail), eq(tempEmailArchive.messageId, normalizedMessageId)))
        .get()
      : null

    if (duplicateArchive) {
      return { data: { archiveId: duplicateArchive.id, duplicated: true, archived: true } }
    }

    const archiveId = crypto.randomUUID()
    await db.insert(tempEmailArchive).values({
      id: archiveId,
      toEmail,
      messageId: normalizedMessageId,
      from: payload.from,
      fromName: payload.fromName?.trim() || null,
      subject: payload.subject?.trim() || "",
      text: payload.text || "",
      html: payload.html || "",
      receivedAt,
      ccJson: payload.cc || "[]",
      replyToJson: payload.replyTo || "[]",
      headersJson: payload.headers || "[]",
      failureReason: "mailbox_not_found",
      createdAt: new Date(),
    })
    await insertArchiveAttachments(archiveId, attachments)

    return { data: { archiveId, duplicated: false, archived: true } }
  }

  const duplicate = normalizedMessageId
    ? await db
      .select({ id: tempEmailMessage.id })
      .from(tempEmailMessage)
      .where(and(eq(tempEmailMessage.mailboxId, mailbox.id), eq(tempEmailMessage.messageId, normalizedMessageId)))
      .get()
    : null

  if (duplicate) {
    return { data: { mailboxId: mailbox.id, messageId: duplicate.id, duplicated: true, archived: false } }
  }

  const messageRowId = crypto.randomUUID()
  await db.insert(tempEmailMessage).values({
    id: messageRowId,
    mailboxId: mailbox.id,
    messageId: normalizedMessageId,
    from: payload.from,
    fromName: payload.fromName?.trim() || null,
    subject: payload.subject?.trim() || "",
    text: payload.text || "",
    html: payload.html || "",
    receivedAt,
    isRead: false,
    ccJson: payload.cc || "[]",
    replyToJson: payload.replyTo || "[]",
    headersJson: payload.headers || "[]",
    createdAt: new Date(),
  })
  await insertEmailAttachments(messageRowId, attachments)

  return { data: { mailboxId: mailbox.id, messageId: messageRowId, duplicated: false, archived: false } }
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
        text: tempEmailMessage.text,
        html: tempEmailMessage.html,
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
    data: rows.map((row) => ({ ...row, hasAttachments: Boolean(row.hasAttachments) })),
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
        text: tempEmailArchive.text,
        html: tempEmailArchive.html,
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
    data: rows.map((row) => ({ ...row, hasAttachments: Boolean(row.hasAttachments) })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
