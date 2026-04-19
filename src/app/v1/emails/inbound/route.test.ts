import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"
import {
  telegramBinding,
  tempEmailArchive,
  tempEmailArchiveAttachment,
  tempEmailAttachment,
  tempEmailMessage,
  tempMailbox,
} from "@/lib/schema"

type RoutePost = (typeof import("./route"))["POST"]

type MailboxRecord = {
  id: string
  userId: string
  emailAddress: string
}

type DuplicateRecord = {
  id: string
}

type TelegramBindingRecord = {
  chatId: string
}

type InsertRow = Record<string, unknown>

let POST: RoutePost

let initDbCalls = 0
let mailboxRecord: MailboxRecord | null = null
let archiveDuplicateRecord: DuplicateRecord | null = null
let messageDuplicateRecord: DuplicateRecord | null = null
let telegramBindingRecord: TelegramBindingRecord | null = null
let insertedMessages: InsertRow[] = []
let insertedMessageAttachments: InsertRow[][] = []
let insertedArchives: InsertRow[] = []
let insertedArchiveAttachments: InsertRow[][] = []
let telegramNotifications: Record<string, unknown>[] = []
let telegramError: Error | null = null
let consoleErrors: unknown[][] = []

const originalConsoleError = console.error
const originalInboundSecret = process.env.INBOUND_EMAIL_SECRET
const originalTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN

mock.module("@/lib/db", () => ({
  initDb: async () => {
    initDbCalls += 1
  },
  db: {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                get: async () => {
                  if (table === tempMailbox) {
                    return mailboxRecord
                  }

                  if (table === tempEmailArchive) {
                    return archiveDuplicateRecord
                  }

                  if (table === tempEmailMessage) {
                    return messageDuplicateRecord
                  }

                  if (table === telegramBinding) {
                    return telegramBindingRecord
                  }

                  return null
                },
              }
            },
          }
        },
      }
    },
    insert(table: unknown) {
      return {
        values: async (values: InsertRow | InsertRow[]) => {
          if (table === tempEmailMessage) {
            insertedMessages.push(values as InsertRow)
            return
          }

          if (table === tempEmailAttachment) {
            insertedMessageAttachments.push(values as InsertRow[])
            return
          }

          if (table === tempEmailArchive) {
            insertedArchives.push(values as InsertRow)
            return
          }

          if (table === tempEmailArchiveAttachment) {
            insertedArchiveAttachments.push(values as InsertRow[])
          }
        },
      }
    },
  },
}))

mock.module("@/lib/telegram", () => ({
  sendInboundEmailTelegramNotification: async (input: Record<string, unknown>) => {
    telegramNotifications.push(input)

    if (telegramError) {
      throw telegramError
    }

    return true
  },
}))

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    to: "alpha@example.com",
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Hello there",
    text: "Plain inbound body",
    html: "<p>Plain inbound body</p>",
    date: "2026-04-05T12:00:00.000Z",
    messageId: "provider-message-1",
    cc: '["cc@example.com"]',
    replyTo: '["reply@example.com"]',
    headers: '{"x-test":"1"}',
    attachments: [
      {
        filename: "hello.txt",
        mimeType: "text/plain",
        r2Path: "attachments/hello.txt",
        size: 12,
      },
    ],
    ...overrides,
  }
}

function createRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://shortly.test/v1/emails/inbound", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inbound-email-secret": "inbound-secret",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeAll(async () => {
  ;({ POST } = await import("./route"))
})

beforeEach(() => {
  initDbCalls = 0
  mailboxRecord = null
  archiveDuplicateRecord = null
  messageDuplicateRecord = null
  telegramBindingRecord = null
  insertedMessages = []
  insertedMessageAttachments = []
  insertedArchives = []
  insertedArchiveAttachments = []
  telegramNotifications = []
  telegramError = null
  consoleErrors = []
  process.env.INBOUND_EMAIL_SECRET = "inbound-secret"
  process.env.TELEGRAM_BOT_TOKEN = "telegram-bot-token"
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
  restoreEnv("INBOUND_EMAIL_SECRET", originalInboundSecret)
  restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken)
})

describe("inbound email route", () => {
  it("returns 500 when the inbound secret is not configured", async () => {
    delete process.env.INBOUND_EMAIL_SECRET

    const response = await POST(createRequest(createPayload()))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "Inbound email secret is not configured",
    })
    expect(initDbCalls).toBe(1)
    expect(insertedMessages).toHaveLength(0)
    expect(insertedArchives).toHaveLength(0)
  })

  it("returns 401 when the request secret does not match", async () => {
    const response = await POST(
      createRequest(createPayload(), {
        "x-inbound-email-secret": "wrong-secret",
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    })
    expect(initDbCalls).toBe(1)
    expect(insertedMessages).toHaveLength(0)
    expect(insertedArchives).toHaveLength(0)
  })

  it("stores matched mailbox emails, saves attachments, and sends Telegram notifications", async () => {
    mailboxRecord = {
      id: "mailbox_123",
      userId: "user_123",
      emailAddress: "alpha@example.com",
    }
    telegramBindingRecord = {
      chatId: "chat_123",
    }

    const response = await POST(createRequest(createPayload()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      mailboxId: "mailbox_123",
      duplicated: false,
      archived: false,
    })
    expect(body.messageId).toBe(insertedMessages[0]?.id)
    expect(insertedMessages).toHaveLength(1)
    expect(insertedMessages[0]).toMatchObject({
      mailboxId: "mailbox_123",
      messageId: "provider-message-1",
      from: "sender@example.com",
      fromName: "Sender",
      subject: "Hello there",
      text: "Plain inbound body",
      html: "<p>Plain inbound body</p>",
      isRead: false,
      ccJson: '["cc@example.com"]',
      replyToJson: '["reply@example.com"]',
      headersJson: '{"x-test":"1"}',
    })
    expect(insertedMessageAttachments).toHaveLength(1)
    expect(insertedMessageAttachments[0]).toHaveLength(1)
    expect(insertedMessageAttachments[0][0]).toMatchObject({
      messageId: body.messageId,
      filename: "hello.txt",
      mimeType: "text/plain",
      r2Path: "attachments/hello.txt",
      size: 12,
    })
    expect(insertedArchives).toHaveLength(0)
    expect(telegramNotifications).toEqual([
      {
        chatId: "chat_123",
        messageId: body.messageId,
        emailAddress: "alpha@example.com",
        from: "sender@example.com",
        fromName: "Sender",
        subject: "Hello there",
        text: "Plain inbound body",
        html: "<p>Plain inbound body</p>",
        attachmentsCount: 1,
      },
    ])
    expect(consoleErrors).toHaveLength(0)
  })

  it("archives unmatched inbound emails and stores archive attachments", async () => {
    const response = await POST(
      createRequest(
        createPayload({
          to: "missing@example.com",
          messageId: "provider-message-archive",
        })
      )
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      duplicated: false,
      archived: true,
    })
    expect(body.archiveId).toBe(insertedArchives[0]?.id)
    expect(insertedMessages).toHaveLength(0)
    expect(insertedArchives).toHaveLength(1)
    expect(insertedArchives[0]).toMatchObject({
      toEmail: "missing@example.com",
      messageId: "provider-message-archive",
      from: "sender@example.com",
      fromName: "Sender",
      subject: "Hello there",
      text: "Plain inbound body",
      html: "<p>Plain inbound body</p>",
      ccJson: '["cc@example.com"]',
      replyToJson: '["reply@example.com"]',
      headersJson: '{"x-test":"1"}',
      failureReason: "mailbox_not_found",
    })
    expect(insertedArchiveAttachments).toHaveLength(1)
    expect(insertedArchiveAttachments[0]).toHaveLength(1)
    expect(insertedArchiveAttachments[0][0]).toMatchObject({
      archiveId: body.archiveId,
      filename: "hello.txt",
      mimeType: "text/plain",
      r2Path: "attachments/hello.txt",
      size: 12,
    })
    expect(telegramNotifications).toHaveLength(0)
  })

  it("returns duplicated results for mailbox messages without reinserting rows", async () => {
    mailboxRecord = {
      id: "mailbox_123",
      userId: "user_123",
      emailAddress: "alpha@example.com",
    }
    messageDuplicateRecord = {
      id: "message_existing",
    }

    const response = await POST(createRequest(createPayload()))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      mailboxId: "mailbox_123",
      messageId: "message_existing",
      duplicated: true,
      archived: false,
    })
    expect(insertedMessages).toHaveLength(0)
    expect(insertedMessageAttachments).toHaveLength(0)
    expect(telegramNotifications).toHaveLength(0)
  })

  it("keeps mailbox delivery successful when Telegram notification fails", async () => {
    mailboxRecord = {
      id: "mailbox_123",
      userId: "user_123",
      emailAddress: "alpha@example.com",
    }
    telegramBindingRecord = {
      chatId: "chat_123",
    }
    telegramError = new Error("telegram offline")

    const response = await POST(
      createRequest(
        createPayload({
          messageId: "provider-message-telegram-fail",
        })
      )
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      mailboxId: "mailbox_123",
      duplicated: false,
      archived: false,
    })
    expect(insertedMessages).toHaveLength(1)
    expect(telegramNotifications).toHaveLength(1)
    expect(consoleErrors).toHaveLength(1)
    expect(consoleErrors[0]?.[0]).toBe("[temp_email] telegram_notification_failed")
    expect(consoleErrors[0]?.[1]).toMatchObject({
      userId: "user_123",
      emailAddress: "alpha@example.com",
      messageId: "provider-message-telegram-fail",
      error: telegramError,
    })
  })
})
