function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || ""
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

type TelegramInboundNotification = {
  chatId: string
  messageId?: string
  emailAddress: string
  from: string
  fromName?: string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  attachmentsCount?: number
}

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<Record<string, string>>>
}

export function buildInboundEmailTelegramMessage(notification: TelegramInboundNotification) {
  const sender = notification.fromName?.trim()
    ? `${notification.fromName.trim()} &lt;${escapeHtml(notification.from)}&gt;`
    : escapeHtml(notification.from)
  const subject = escapeHtml(notification.subject?.trim() || "(无主题)")
  const bodySource = notification.text?.trim() || notification.html?.replace(/<[^>]+>/g, " ").trim() || ""
  const bodyPreview = bodySource ? escapeHtml(truncate(bodySource.replace(/\s+/g, " "), 280)) : "(无正文预览)"
  const attachmentLine = notification.attachmentsCount && notification.attachmentsCount > 0
    ? `\n附件：${notification.attachmentsCount} 个`
    : ""

  return [
    "<b>收到新邮件</b>",
    "",
    `邮箱：<code>${escapeHtml(notification.emailAddress)}</code>`,
    `发件人：${sender}`,
    `主题：${subject}`,
    `${attachmentLine}`.trim(),
    "",
    `正文预览：\n${bodyPreview}`,
  ].filter(Boolean).join("\n")
}

function buildInboundEmailReplyMarkup(messageId?: string): TelegramReplyMarkup | undefined {
  if (!messageId?.trim()) {
    return undefined
  }

  return {
    inline_keyboard: [
      [
        { text: "已读", callback_data: `email:read:${messageId}` },
        { text: "删除", callback_data: `email:delete:${messageId}` },
      ],
      [{ text: "查看邮件详情", callback_data: `email:detail:${messageId}` }],
    ],
  }
}

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) {
  const token = getTelegramBotToken()
  if (!token || !chatId.trim()) {
    return false
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => "")
    throw new Error(`Telegram sendMessage failed: ${response.status} ${message}`.trim())
  }

  return true
}

export async function sendInboundEmailTelegramNotification(notification: TelegramInboundNotification) {
  const text = buildInboundEmailTelegramMessage(notification)
  return sendTelegramMessage(notification.chatId, text, buildInboundEmailReplyMarkup(notification.messageId))
}
