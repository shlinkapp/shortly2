import { Hono } from "hono";

type Bindings = {
  TELEGRAM_BOT_TOKEN: string;
  API_BASE_URL: string;
  TGBOT_KV: KVNamespace;
  DEFAULT_SHORT_DOMAIN?: string;
  DEFAULT_EMAIL_DOMAIN?: string;
};

type TelegramChat = {
  id: number;
};

type TelegramUser = {
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from?: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
};

type TelegramApiEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type EmailListItem = {
  id: string;
  emailAddress: string;
  messageCount: number;
  unreadCount: number;
};

type EmailListResponse = {
  data: EmailListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type ShortLinkListItem = {
  id: string;
  domain: string;
  slug: string;
  shortUrl: string;
  originalUrl: string;
  clicks: number;
  isExpired: boolean;
};

type ShortLinkListResponse = {
  data: ShortLinkListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type DomainListResponse = {
  emailDomains?: Array<{ host: string; isDefault?: boolean }>;
  shortDomains?: Array<{ host: string; isDefault?: boolean }>;
};

type ResolvedDomains = {
  email: string[];
  short: string[];
};

type CallbackAction =
  | "email:delete"
  | "email:read"
  | "short:create"
  | "short:cancel"
  | "short:set_domain"
  | "short:set_slug"
  | "short:set_target";

type SessionField = "domain" | "slug" | "target";

type ShortCreateSession = {
  awaiting?: SessionField;
  draft: {
    domain: string;
    slug: string;
    target: string;
  };
  messageId?: number;
  type: "short_create";
};

type BotSession = ShortCreateSession;

type SendMessageOptions = {
  disableWebPagePreview?: boolean;
  replyMarkup?: Record<string, unknown>;
};

const app = new Hono<{ Bindings: Bindings }>();

const HELP_TEXT = [
  "<b>Shortly Telegram Bot</b>",
  "",
  "<code>/setkey &lt;api_key&gt;</code> 绑定你的 Shortly API Key",
  "<code>/short</code> 通过按钮交互创建短链接",
  "<code>/short &lt;url&gt; [slug] [domain]</code> 直接创建短链接",
  "<code>/links [page]</code> 查看当前短链接列表",
  "<code>/email [prefix] [domain]</code> 创建临时邮箱",
  "<code>/emails [page]</code> 查看当前邮箱列表",
  "<code>/me</code> 查看当前机器人状态",
  "<code>/cancel</code> 取消当前交互流程",
].join("\n");

const LIST_PAGE_SIZE = 10;
const SESSION_TTL_SECONDS = 30 * 60;

app.get("/", (c) => c.text("Shortly Telegram Bot Worker is running!"));

app.post("/webhook", async (c) => {
  const update = await c.req.json<TelegramUpdate>();

  if (update.callback_query?.data) {
    await handleCallbackQuery(c, update.callback_query);
    return c.text("OK");
  }

  if (update.message?.text) {
    await handleIncomingMessage(c, update.message);
  }

  return c.text("OK");
});

async function handleIncomingMessage(
  c: { env: Bindings },
  message: TelegramMessage,
) {
  const text = message.text?.trim();
  if (!text) {
    return;
  }

  const chatId = message.chat.id;
  const session = await getSession(c.env, chatId);

  if (!text.startsWith("/") && session?.type === "short_create" && session.awaiting) {
    await handleShortDraftInput(c, chatId, text, session);
    return;
  }

  await handleCommand(c, text, chatId, message.from?.username);
}

async function handleCommand(
  c: { env: Bindings },
  text: string,
  chatId: number,
  username?: string,
) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const apiBase = c.env.API_BASE_URL;
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.toLowerCase();

  if (command === "/start") {
    await sendMessage(token, chatId, HELP_TEXT);
    return;
  }

  if (command === "/setkey") {
    const apiKey = args[0];
    if (!apiKey) {
      await sendMessage(
        token,
        chatId,
        "请提供你的 API Key。\n用法：<code>/setkey &lt;your_api_key&gt;</code>",
      );
      return;
    }

    try {
      const resp = await fetch(`${apiBase}/integrations/telegram/bind`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ chatId: chatId.toString(), username }),
      });

      if (!resp.ok) {
        await sendMessage(
          token,
          chatId,
          `绑定失败。\n${escapeHtml(await readApiError(resp))}`,
        );
        return;
      }

      await c.env.TGBOT_KV.put(getApiKeyStorageKey(chatId), apiKey);
      await clearSession(c.env, chatId);
      await sendMessage(
        token,
        chatId,
        "账号绑定成功。\n现在可以使用 <code>/short</code>、<code>/links</code>、<code>/email</code> 和 <code>/emails</code>。",
      );
    } catch (error) {
      console.error("Failed to bind Telegram chat:", error);
      await sendMessage(token, chatId, "网络异常，请稍后再试。");
    }
    return;
  }

  if (command === "/cancel") {
    await clearSession(c.env, chatId);
    await sendMessage(token, chatId, "已取消当前交互流程。");
    return;
  }

  const apiKey = await c.env.TGBOT_KV.get(getApiKeyStorageKey(chatId));
  if (!apiKey && requiresApiKey(command)) {
    await sendMessage(
      token,
      chatId,
      "你还没有绑定 API Key。\n请先使用 <code>/setkey &lt;your_api_key&gt;</code>。",
    );
    return;
  }

  switch (command) {
    case "/short":
      if (args[0]) {
        await createShortLinkFromInput(c, chatId, apiKey ?? "", args);
        return;
      }

      await startShortCreateSession(c, chatId);
      return;
    case "/links":
      await listShortLinks(c, chatId, apiKey ?? "", args[0]);
      return;
    case "/email":
      await createMailbox(c, chatId, apiKey ?? "", args);
      return;
    case "/emails":
      await listMailboxes(c, chatId, apiKey ?? "", args[0]);
      return;
    case "/me": {
      const domains = await resolveDomains(c.env);
      await sendMessage(
        token,
        chatId,
        [
          "<b>机器人状态</b>",
          "",
          "API Key：<b>已绑定</b>",
          `默认短链域名：<code>${escapeHtml(domains.short[0])}</code>`,
          `默认邮箱域名：<code>${escapeHtml(domains.email[0])}</code>`,
        ].join("\n"),
      );
      return;
    }
    default:
      await sendMessage(token, chatId, HELP_TEXT);
  }
}

async function startShortCreateSession(c: { env: Bindings }, chatId: number) {
  const domains = await resolveDomains(c.env);
  const session: ShortCreateSession = {
    draft: {
      domain: domains.short[0],
      slug: generateRandomSlug(6),
      target: "",
    },
    type: "short_create",
  };

  const message = await sendShortDraftMessage(
    c,
    chatId,
    session,
    "请使用下方按钮补全短链接草稿。",
  );

  if (message) {
    session.messageId = message.message_id;
  }

  await saveSession(c.env, chatId, session);
}

async function handleShortDraftInput(
  c: { env: Bindings },
  chatId: number,
  input: string,
  session: ShortCreateSession,
) {
  const field = session.awaiting;
  if (!field) {
    return;
  }

  const nextSession: ShortCreateSession = {
    ...session,
    awaiting: undefined,
    draft: {
      ...session.draft,
    },
  };

  if (field === "target") {
    nextSession.draft.target = input.trim();
  } else if (field === "slug") {
    nextSession.draft.slug = normalizeSlug(input) || generateRandomSlug(6);
  } else {
    nextSession.draft.domain = normalizeDomain(input) || session.draft.domain;
  }

  const message = await sendShortDraftMessage(
    c,
    chatId,
    nextSession,
    `<b>${getFieldLabel(field)}</b> 已保存。你可以继续修改，或直接创建短链接。`,
  );

  if (message) {
    nextSession.messageId = message.message_id;
  }

  await saveSession(c.env, chatId, nextSession);
}

async function handleCallbackQuery(
  c: { env: Bindings },
  query: TelegramCallbackQuery,
) {
  const action = query.data as CallbackAction;
  const chatId = query.message?.chat.id;
  if (!chatId) {
    await answerCallbackQuery(c.env.TELEGRAM_BOT_TOKEN, query.id, "未找到当前会话。");
    return;
  }

  if (query.data?.startsWith("email:")) {
    await handleEmailMessageAction(c, query, chatId);
    return;
  }

  const session = await getSession(c.env, chatId);
  if (!session || session.type !== "short_create") {
    await answerCallbackQuery(
      c.env.TELEGRAM_BOT_TOKEN,
      query.id,
      "草稿已过期，请重新发送 /short。",
    );
    return;
  }

  if (query.message?.message_id) {
    session.messageId = query.message.message_id;
  }

  switch (action) {
    case "short:set_target":
    case "short:set_slug":
    case "short:set_domain": {
      const field = action.replace("short:set_", "") as SessionField;
      const nextSession: ShortCreateSession = {
        ...session,
        awaiting: field,
      };
      await saveSession(c.env, chatId, nextSession);
      await sendShortDraftMessage(
        c,
        chatId,
        nextSession,
        `请在下一条消息中发送新的<b>${getFieldLabel(field)}</b>。`,
      );
      await answerCallbackQuery(
        c.env.TELEGRAM_BOT_TOKEN,
        query.id,
        `请发送${getFieldLabel(field)}。`,
      );
      return;
    }
    case "short:create": {
      if (!session.draft.target) {
        const nextSession: ShortCreateSession = {
          ...session,
          awaiting: "target",
        };
        await saveSession(c.env, chatId, nextSession);
        await sendShortDraftMessage(
          c,
          chatId,
          nextSession,
          "创建前必须先填写目标链接。",
        );
        await answerCallbackQuery(
          c.env.TELEGRAM_BOT_TOKEN,
          query.id,
          "请先发送目标链接。",
        );
        return;
      }

      const apiKey = await c.env.TGBOT_KV.get(getApiKeyStorageKey(chatId));
      if (!apiKey) {
        await clearSession(c.env, chatId);
        await answerCallbackQuery(
          c.env.TELEGRAM_BOT_TOKEN,
          query.id,
          "请重新绑定 API Key。",
        );
        await sendMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          chatId,
          "没有找到你的 API Key 绑定记录。\n请重新使用 <code>/setkey &lt;your_api_key&gt;</code>。",
        );
        return;
      }

      await answerCallbackQuery(c.env.TELEGRAM_BOT_TOKEN, query.id, "正在创建短链接...");
      const success = await createShortLink(c, chatId, apiKey, session.draft);
      if (success) {
        await clearSession(c.env, chatId);
      }
      return;
    }
    case "short:cancel":
      await clearSession(c.env, chatId);
      await answerCallbackQuery(c.env.TELEGRAM_BOT_TOKEN, query.id, "已取消。");
      if (session.messageId) {
        await editMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          chatId,
          session.messageId,
          "已取消当前短链接草稿。",
        );
      } else {
        await sendMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          chatId,
          "已取消当前短链接草稿。",
        );
      }
      return;
    default:
      await answerCallbackQuery(c.env.TELEGRAM_BOT_TOKEN, query.id, "未知操作。");
  }
}

async function handleEmailMessageAction(
  c: { env: Bindings },
  query: TelegramCallbackQuery,
  chatId: number,
) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const [, action, emailId] = query.data?.split(":") || [];

  if (!emailId || (action !== "read" && action !== "delete")) {
    await answerCallbackQuery(token, query.id, "邮件操作参数无效。");
    return;
  }

  const apiKey = await c.env.TGBOT_KV.get(getApiKeyStorageKey(chatId));
  if (!apiKey) {
    await answerCallbackQuery(token, query.id, "请先重新绑定 API Key。");
    await sendMessage(
      token,
      chatId,
      "当前会话缺少 API Key 绑定，请重新使用 <code>/setkey &lt;your_api_key&gt;</code>。",
    );
    return;
  }

  try {
    const responsePath = action === "read"
      ? `/emails/messages/${emailId}/read`
      : `/emails/messages/${emailId}`;
    const response = await fetch(`${c.env.API_BASE_URL}${responsePath}`, {
      method: action === "read" ? "POST" : "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      await answerCallbackQuery(
        token,
        query.id,
        `操作失败：${truncate(await readApiError(response), 50)}`,
      );
      return;
    }

    if (query.message?.message_id) {
      if (action === "read") {
        await editMessageReplyMarkup(token, chatId, query.message.message_id, {
          inline_keyboard: [[
            { text: "删除", callback_data: `email:delete:${emailId}` },
          ]],
        });
        await answerCallbackQuery(token, query.id, "已标记为已读。");
        return;
      }

      await editMessageReplyMarkup(token, chatId, query.message.message_id, {
        inline_keyboard: [],
      });
    }

    await answerCallbackQuery(
      token,
      query.id,
      action === "read" ? "已标记为已读。" : "已从收件箱删除。",
    );
  } catch (error) {
    console.error("Failed to handle email message action:", error);
    await answerCallbackQuery(token, query.id, "网络异常，请稍后再试。");
  }
}

async function createMailbox(
  c: { env: Bindings },
  chatId: number,
  apiKey: string,
  args: string[],
) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const domains = await resolveDomains(c.env);
  const prefix = normalizeEmailPrefix(args[0]) || generateRandomLowercaseLetters(6);
  const domain = normalizeDomain(args[1]) || domains.email[0];
  const emailAddress = `${prefix}@${domain}`;

  try {
    const resp = await fetch(`${c.env.API_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ emailAddress }),
    });

    if (!resp.ok) {
      await sendMessage(
        token,
        chatId,
        `邮箱创建失败。\n${escapeHtml(await readApiError(resp))}`,
      );
      return;
    }

    await sendMessage(
      token,
      chatId,
      [
        "<b>邮箱创建成功</b>",
        "",
        `地址：<code>${escapeHtml(emailAddress)}</code>`,
        "你可以使用 <code>/emails</code> 查看当前邮箱列表。",
      ].join("\n"),
    );
  } catch (error) {
    console.error("Failed to create mailbox:", error);
    await sendMessage(token, chatId, "网络异常，请稍后再试。");
  }
}

async function listMailboxes(
  c: { env: Bindings },
  chatId: number,
  apiKey: string,
  pageArg?: string,
) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const page = parsePositiveInteger(pageArg, 1);

  try {
    const resp = await fetch(
      `${c.env.API_BASE_URL}/emails?page=${page}&limit=${LIST_PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!resp.ok) {
      await sendMessage(
        token,
        chatId,
        `获取邮箱列表失败。\n${escapeHtml(await readApiError(resp))}`,
      );
      return;
    }

    const data = (await resp.json()) as EmailListResponse;
    if (!data.data?.length) {
      await sendMessage(token, chatId, "当前还没有已创建的邮箱。可以先发送 <code>/email</code> 创建一个。");
      return;
    }

    const totalPages = Math.max(1, data.totalPages || Math.ceil(data.total / LIST_PAGE_SIZE));
    const offset = (page - 1) * LIST_PAGE_SIZE;
    const lines = data.data.map((item, index) => {
      const position = offset + index + 1;
      return `${position}. <code>${escapeHtml(item.emailAddress)}</code> · 未读 ${item.unreadCount} / 总计 ${item.messageCount}`;
    });

    const footer = page < totalPages
      ? `\n\n下一页：<code>/emails ${page + 1}</code>`
      : "";

    await sendMessage(
      token,
      chatId,
      `<b>当前邮箱列表</b>\n\n${lines.join("\n")}\n\n第 ${page}/${totalPages} 页 · 共 ${data.total} 个${footer}`,
    );
  } catch (error) {
    console.error("Failed to list mailboxes:", error);
    await sendMessage(token, chatId, "网络异常，请稍后再试。");
  }
}

async function createShortLinkFromInput(
  c: { env: Bindings },
  chatId: number,
  apiKey: string,
  args: string[],
) {
  const domains = await resolveDomains(c.env);
  const draft = {
    domain: normalizeDomain(args[2]) || domains.short[0],
    slug: normalizeSlug(args[1]) || generateRandomSlug(6),
    target: args[0]?.trim() || "",
  };

  await createShortLink(c, chatId, apiKey, draft);
}

async function createShortLink(
  c: { env: Bindings },
  chatId: number,
  apiKey: string,
  draft: ShortCreateSession["draft"],
) {
  const token = c.env.TELEGRAM_BOT_TOKEN;

  try {
    const resp = await fetch(`${c.env.API_BASE_URL}/shorten`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: draft.target,
        customSlug: draft.slug,
        domain: draft.domain,
      }),
    });

    if (!resp.ok) {
      await sendMessage(
        token,
        chatId,
        `短链接创建失败。\n${escapeHtml(await readApiError(resp))}`,
      );
      return false;
    }

    const result = await resp.json().catch(() => null) as { shortUrl?: string } | null;
    const finalShortUrl = result?.shortUrl || `https://${draft.domain}/${draft.slug}`;

    await sendMessage(
      token,
      chatId,
      [
        "<b>短链接创建成功</b>",
        "",
        `短链：<code>${escapeHtml(finalShortUrl)}</code>`,
        `目标：<code>${escapeHtml(draft.target)}</code>`,
      ].join("\n"),
    );

    return true;
  } catch (error) {
    console.error("Failed to create short link:", error);
    await sendMessage(token, chatId, "网络异常，请稍后再试。");
    return false;
  }
}

async function listShortLinks(
  c: { env: Bindings },
  chatId: number,
  apiKey: string,
  pageArg?: string,
) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const page = parsePositiveInteger(pageArg, 1);

  try {
    const resp = await fetch(
      `${c.env.API_BASE_URL}/links?page=${page}&limit=${LIST_PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!resp.ok) {
      await sendMessage(
        token,
        chatId,
        `获取短链接列表失败。\n${escapeHtml(await readApiError(resp))}`,
      );
      return;
    }

    const data = (await resp.json()) as ShortLinkListResponse;
    if (!data.data?.length) {
      await sendMessage(token, chatId, "当前还没有已创建的短链接。可以先发送 <code>/short</code> 创建一个。");
      return;
    }

    const totalPages = Math.max(1, data.totalPages || Math.ceil(data.total / LIST_PAGE_SIZE));
    const offset = (page - 1) * LIST_PAGE_SIZE;
    const lines = data.data.map((item, index) => {
      const position = offset + index + 1;
      const status = item.isExpired ? "已失效" : "有效";
      return [
        `${position}. <code>${escapeHtml(item.shortUrl)}</code>`,
        `   ${escapeHtml(truncate(item.originalUrl, 90))}`,
        `   状态：${status} · 点击：${item.clicks}`,
      ].join("\n");
    });

    const footer = page < totalPages
      ? `\n\n下一页：<code>/links ${page + 1}</code>`
      : "";

    await sendMessage(
      token,
      chatId,
      `<b>当前短链接列表</b>\n\n${lines.join("\n\n")}\n\n第 ${page}/${totalPages} 页 · 共 ${data.total} 条${footer}`,
    );
  } catch (error) {
    console.error("Failed to list short links:", error);
    await sendMessage(token, chatId, "网络异常，请稍后再试。");
  }
}

async function sendShortDraftMessage(
  c: { env: Bindings },
  chatId: number,
  session: ShortCreateSession,
  notice?: string,
) {
  const text = renderShortDraft(session, notice);

  if (session.messageId) {
    const edited = await editMessage(
      c.env.TELEGRAM_BOT_TOKEN,
      chatId,
      session.messageId,
      text,
      {
        replyMarkup: buildShortDraftKeyboard(),
      },
    );
    if (edited) {
      return edited;
    }
  }

  return sendMessage(c.env.TELEGRAM_BOT_TOKEN, chatId, text, {
    replyMarkup: buildShortDraftKeyboard(),
  });
}

function renderShortDraft(session: ShortCreateSession, notice?: string) {
  const draftLines = [
    "<b>短链接草稿</b>",
    "",
    `目标链接：<code>${escapeHtml(session.draft.target || "尚未设置")}</code>`,
    `短链标识：<code>${escapeHtml(session.draft.slug)}</code>`,
    `域名：<code>${escapeHtml(session.draft.domain)}</code>`,
  ];

  if (notice) {
    draftLines.push("", notice);
  }

  if (session.awaiting) {
    draftLines.push("", `等待你在下一条消息中发送<b>${getFieldLabel(session.awaiting)}</b>。`);
  }

  return draftLines.join("\n");
}

function buildShortDraftKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "设置目标链接", callback_data: "short:set_target" }],
      [
        { text: "设置短链标识", callback_data: "short:set_slug" },
        { text: "设置域名", callback_data: "short:set_domain" },
      ],
      [
        { text: "创建", callback_data: "short:create" },
        { text: "取消", callback_data: "short:cancel" },
      ],
    ],
  };
}

async function resolveDomains(env: Bindings): Promise<ResolvedDomains> {
  const fallbackShort = getDefaultDomains(env.DEFAULT_SHORT_DOMAIN, "short.ly");
  const fallbackEmail = getDefaultDomains(env.DEFAULT_EMAIL_DOMAIN, "mail.short.ly");

  try {
    const response = await fetch(`${env.API_BASE_URL}/domains`);
    if (!response.ok) {
      return { short: fallbackShort, email: fallbackEmail };
    }

    const data = await response.json() as DomainListResponse;
    return {
      short: selectPreferredDomains(data.shortDomains, fallbackShort),
      email: selectPreferredDomains(data.emailDomains, fallbackEmail),
    };
  } catch (error) {
    console.error("Failed to resolve domains from Shortly API:", error);
    return { short: fallbackShort, email: fallbackEmail };
  }
}

function selectPreferredDomains(
  domains: Array<{ host: string; isDefault?: boolean }> | undefined,
  fallback: string[],
) {
  if (!domains?.length) {
    return fallback;
  }

  const normalized = domains
    .map((item) => ({ host: normalizeDomain(item.host), isDefault: Boolean(item.isDefault) }))
    .filter((item): item is { host: string; isDefault: boolean } => Boolean(item.host));

  if (!normalized.length) {
    return fallback;
  }

  const defaults = normalized.filter((item) => item.isDefault).map((item) => item.host);
  const others = normalized.filter((item) => !item.isDefault).map((item) => item.host);
  const merged = [...defaults, ...others];

  return Array.from(new Set(merged));
}

async function getSession(env: Bindings, chatId: number) {
  const raw = await env.TGBOT_KV.get(getSessionStorageKey(chatId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as BotSession;
  } catch (error) {
    console.error("Failed to parse bot session:", error);
    return null;
  }
}

async function saveSession(env: Bindings, chatId: number, session: BotSession) {
  await env.TGBOT_KV.put(
    getSessionStorageKey(chatId),
    JSON.stringify(session),
    {
      expirationTtl: SESSION_TTL_SECONDS,
    },
  );
}

async function clearSession(env: Bindings, chatId: number) {
  await env.TGBOT_KV.delete(getSessionStorageKey(chatId));
}

function getApiKeyStorageKey(chatId: number) {
  return `user:${chatId}:apikey`;
}

function getSessionStorageKey(chatId: number) {
  return `user:${chatId}:session`;
}

function requiresApiKey(command: string) {
  return ["/email", "/emails", "/links", "/me", "/short"].includes(command);
}

function getDefaultDomains(configValue: string | undefined, fallback: string) {
  const domains = (configValue || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return domains.length > 0 ? domains : [fallback];
}

function normalizeSlug(value?: string) {
  return value?.trim().replace(/^\/+/, "");
}

function normalizeDomain(value?: string) {
  return value
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function normalizeEmailPrefix(value?: string) {
  return value?.trim().toLowerCase();
}

function generateRandomSlug(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomLowercaseLetters(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

function getFieldLabel(field: SessionField) {
  switch (field) {
    case "target":
      return "目标链接";
    case "slug":
      return "短链标识";
    case "domain":
      return "域名";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readApiError(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      return data.error || data.message || JSON.stringify(data);
    }

    return await response.text();
  } catch (error) {
    console.error("Failed to parse API error:", error);
    return "未知错误";
  }
}

async function callTelegramApi<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as TelegramApiEnvelope<T>;
  if (!response.ok || !data.ok) {
    console.error(`Telegram ${method} failed:`, data.description || data);
    return null;
  }

  return data.result ?? null;
}

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  options: SendMessageOptions = {},
) {
  return callTelegramApi<TelegramMessage>(token, "sendMessage", {
    chat_id: chatId,
    disable_web_page_preview: options.disableWebPagePreview ?? true,
    parse_mode: "HTML",
    reply_markup: options.replyMarkup,
    text,
  });
}

async function editMessage(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  options: SendMessageOptions = {},
) {
  return callTelegramApi<TelegramMessage>(token, "editMessageText", {
    chat_id: chatId,
    disable_web_page_preview: options.disableWebPagePreview ?? true,
    message_id: messageId,
    parse_mode: "HTML",
    reply_markup: options.replyMarkup,
    text,
  });
}

async function editMessageReplyMarkup(
  token: string,
  chatId: number,
  messageId: number,
  replyMarkup: Record<string, unknown>,
) {
  return callTelegramApi<TelegramMessage>(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

async function answerCallbackQuery(token: string, callbackQueryId: string, text: string) {
  await callTelegramApi<boolean>(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export default app;
