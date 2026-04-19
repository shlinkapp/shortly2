import { afterEach, describe, expect, it, mock } from "bun:test"
import { buildInboundEmailTelegramMessage, sendInboundEmailTelegramNotification, sendTelegramMessage } from "./telegram"

describe("buildInboundEmailTelegramMessage", () => {
  it("renders sender, subject, preview, and attachments", () => {
    const text = buildInboundEmailTelegramMessage({
      chatId: "123",
      emailAddress: "inbox@example.com",
      from: "sender@example.com",
      fromName: 'Alice <Admin>',
      subject: 'Hello "team"',
      text: "First line\nSecond line",
      attachmentsCount: 2,
    })

    expect(text).toContain("<b>收到新邮件</b>")
    expect(text).toContain("邮箱：<code>inbox@example.com</code>")
    expect(text).toContain("发件人：Alice <Admin> &lt;sender@example.com&gt;")
    expect(text).toContain("主题：Hello &quot;team&quot;")
    expect(text).toContain("附件：2 个")
    expect(text).toContain("正文预览：\nFirst line Second line")
  })

  it("falls back when subject and body are missing", () => {
    const text = buildInboundEmailTelegramMessage({
      chatId: "123",
      emailAddress: "inbox@example.com",
      from: "sender@example.com",
    })

    expect(text).toContain("主题：(无主题)")
    expect(text).toContain("正文预览：\n(无正文预览)")
  })
})

describe("sendTelegramMessage", () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalToken
    }
  })

  it("returns false when token is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const fetchMock = mock(() => Promise.resolve(new Response()))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(sendTelegramMessage("123", "hello")).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts HTML messages to Telegram", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token"
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(sendTelegramMessage("123", "hello")).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: "123",
      text: "hello",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    })
  })

  it("throws when Telegram rejects the message", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token"
    const fetchMock = mock(() => Promise.resolve(new Response("bad request", { status: 400 })))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(sendTelegramMessage("123", "hello")).rejects.toThrow("Telegram sendMessage failed: 400 bad request")
  })
})

describe("sendInboundEmailTelegramNotification", () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalToken
    }
  })

  it("builds the inbound message and sends it", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token"
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(sendInboundEmailTelegramNotification({
      chatId: "456",
      messageId: "message_123",
      emailAddress: "mail@example.com",
      from: "sender@example.com",
      subject: "Status update",
      text: "Everything passed.",
      attachmentsCount: 1,
    })).resolves.toBe(true)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.chat_id).toBe("456")
    expect(body.text).toContain("邮箱：<code>mail@example.com</code>")
    expect(body.text).toContain("主题：Status update")
    expect(body.text).toContain("附件：1 个")
    expect(body.reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: "已读", callback_data: "email:read:message_123" },
          { text: "删除", callback_data: "email:delete:message_123" },
        ],
        [{ text: "查看邮件详情", callback_data: "email:detail:message_123" }],
      ],
    })
  })
})
