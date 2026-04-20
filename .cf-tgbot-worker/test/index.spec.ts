import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import worker from "../src/index";
import {
  COMMON_EMAIL_FIRST_NAMES,
  COMMON_EMAIL_LAST_NAMES,
  generateRandomEmailPrefix,
} from "../src/random-email-prefix";

describe("Shortly Telegram worker", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns Shortly branding on root route", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/"),
      {} as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Shortly Telegram Bot Worker is running!");
  });

  it("generates temp mailbox prefixes from common names and three digits", () => {
    expect(COMMON_EMAIL_FIRST_NAMES.length).toBeGreaterThanOrEqual(100);
    expect(COMMON_EMAIL_LAST_NAMES.length).toBeGreaterThanOrEqual(100);
    expect(generateRandomEmailPrefix(() => 0)).toBe("james-smith000");
    expect(generateRandomEmailPrefix(() => 0.9999)).toBe("evelyn-graham999");
    expect(generateRandomEmailPrefix()).toMatch(/^[a-z]+-[a-z]+[0-9]{3}$/);
  });

  it("returns Shortly help text for /start", async () => {
    const telegramApiMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = telegramApiMock as typeof fetch;

    const response = await worker.fetch(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            message_id: 1,
            chat: { id: 123 },
            text: "/start",
          },
        }),
      }),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn(),
          delete: vi.fn(),
        } as unknown as KVNamespace,
        DEFAULT_SHORT_DOMAIN: "fallback.short.ly",
        DEFAULT_EMAIL_DOMAIN: "fallback.mail.short.ly",
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(telegramApiMock).toHaveBeenCalledTimes(1);
    const [, init] = telegramApiMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.text).toContain("Shortly Telegram Bot");
    expect(payload.text).toContain("/emails [page]");
  });

  it("uses /v1/domains values before fallback defaults", async () => {
    const apiResponses = [
      new Response(JSON.stringify({
        shortDomains: [
          { host: "s.example.com", isDefault: false },
          { host: "go.example.com", isDefault: true },
        ],
        emailDomains: [
          { host: "inbox.example.com", isDefault: false },
          { host: "mail.example.com", isDefault: true },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(apiResponses.shift()));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            message_id: 1,
            chat: { id: 123 },
            text: "/me",
          },
        }),
      }),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: vi.fn().mockImplementation((key: string) => key.endsWith(":apikey") ? Promise.resolve("api-key") : Promise.resolve(null)),
          put: vi.fn(),
          delete: vi.fn(),
        } as unknown as KVNamespace,
        DEFAULT_SHORT_DOMAIN: "fallback.short.ly",
        DEFAULT_EMAIL_DOMAIN: "fallback.mail.short.ly",
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://short.ly/v1/domains");
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.text).toContain("go.example.com");
    expect(payload.text).toContain("mail.example.com");
  });

  it("falls back to configured defaults when /v1/domains fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("upstream error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            message_id: 1,
            chat: { id: 123 },
            text: "/me",
          },
        }),
      }),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: vi.fn().mockImplementation((key: string) => key.endsWith(":apikey") ? Promise.resolve("api-key") : Promise.resolve(null)),
          put: vi.fn(),
          delete: vi.fn(),
        } as unknown as KVNamespace,
        DEFAULT_SHORT_DOMAIN: "fallback.short.ly,backup.short.ly",
        DEFAULT_EMAIL_DOMAIN: "fallback.mail.short.ly",
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.text).toContain("fallback.short.ly");
    expect(payload.text).toContain("fallback.mail.short.ly");
  });

  it("deletes a mailbox by email address with /delete", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("https://api.telegram.org/")) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      return Promise.resolve(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            message_id: 1,
            chat: { id: 123 },
            text: "/delete Inbox@Example.com",
          },
        }),
      }),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: vi.fn().mockImplementation((key: string) => key.endsWith(":apikey") ? Promise.resolve("api-key") : Promise.resolve(null)),
          put: vi.fn(),
          delete: vi.fn(),
        } as unknown as KVNamespace,
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://short.ly/v1/emails/inbox%40example.com");
    const [, apiInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(apiInit.method).toBe("DELETE");
    expect(apiInit.headers).toEqual({ Authorization: "Bearer api-key" });
    const [, telegramInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(telegramInit.body)).text).toContain("inbox@example.com");
  });

  it("uses a common-name random prefix when /email omits one", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "https://short.ly/v1/domains") {
        return Promise.resolve(new Response(JSON.stringify({
          emailDomains: [{ host: "mail.example.com", isDefault: true }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      if (url === "https://short.ly/v1/emails") {
        return Promise.resolve(new Response(JSON.stringify({ data: { id: "mailbox_1" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            message_id: 1,
            chat: { id: 123 },
            text: "/email",
          },
        }),
      }),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: vi.fn().mockImplementation((key: string) => key.endsWith(":apikey") ? Promise.resolve("api-key") : Promise.resolve(null)),
          put: vi.fn(),
          delete: vi.fn(),
        } as unknown as KVNamespace,
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    const [, apiInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const apiPayload = JSON.parse(String(apiInit.body));
    expect(apiPayload.emailAddress).toMatch(/^[a-z]+-[a-z]+[0-9]{3}@mail\.example\.com$/);
  });

  it("creates one-time email detail links from inline callbacks", async () => {
    const putMock = vi.fn();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 3 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request("https://worker.example.com/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          callback_query: {
            id: "callback-1",
            data: "email:detail:message_123",
            message: {
              message_id: 10,
              chat: { id: 123 },
            },
          },
        }),
      }),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: vi.fn().mockResolvedValue("api-key"),
          put: putMock,
          delete: vi.fn(),
        } as unknown as KVNamespace,
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(putMock).toHaveBeenCalledTimes(1);
    const [storageKey, rawPayload, options] = putMock.mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(storageKey).toMatch(/^email-detail:[a-f0-9]{48}$/);
    expect(JSON.parse(rawPayload)).toMatchObject({ chatId: 123, emailId: "message_123" });
    expect(options.expirationTtl).toBe(600);

    const [, telegramInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const telegramPayload = JSON.parse(String(telegramInit.body));
    expect(telegramPayload.reply_markup.inline_keyboard[0][0].url).toMatch(/^https:\/\/worker\.example\.com\/email-detail\/[a-f0-9]{48}$/);
  });

  it("renders a one-time email detail page and consumes the token", async () => {
    const detailToken = "a".repeat(48);
    const deleteMock = vi.fn();
    const getMock = vi.fn().mockImplementation((key: string) => {
      if (key === `email-detail:${detailToken}`) {
        return Promise.resolve(JSON.stringify({
          chatId: 123,
          emailId: "message_123",
          createdAt: Date.now(),
        }));
      }

      if (key === "user:123:apikey") {
        return Promise.resolve("api-key");
      }

      return Promise.resolve(null);
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "message_123",
        mailboxEmailAddress: "inbox@example.com",
        from: "sender@example.com",
        fromName: "Alice",
        subject: "Status update",
        text: "Everything passed.",
        receivedAt: "2026-04-19T01:00:00.000Z",
        isRead: false,
        attachments: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request(`https://worker.example.com/email-detail/${detailToken}`),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: getMock,
          put: vi.fn(),
          delete: deleteMock,
        } as unknown as KVNamespace,
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith(`email-detail:${detailToken}`);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://short.ly/v1/emails/messages/message_123");
    const html = await response.text();
    expect(html).toContain("Status update");
    expect(html).toContain("Everything passed.");
    expect(html).toContain("这个链接已经失效");
  });

  it("renders HTML email bodies in the one-time detail page", async () => {
    const detailToken = "b".repeat(48);
    const deleteMock = vi.fn();
    const getMock = vi.fn().mockImplementation((key: string) => {
      if (key === `email-detail:${detailToken}`) {
        return Promise.resolve(JSON.stringify({
          chatId: 123,
          emailId: "message_html",
          createdAt: Date.now(),
        }));
      }

      if (key === "user:123:apikey") {
        return Promise.resolve("api-key");
      }

      return Promise.resolve(null);
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "message_html",
        mailboxEmailAddress: "inbox@example.com",
        from: "sender@example.com",
        subject: "HTML update",
        text: "",
        html: "<article><h2>Rendered HTML</h2><p><strong>Everything passed.</strong></p></article>",
        receivedAt: "2026-04-19T01:00:00.000Z",
        isRead: false,
        attachments: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await worker.fetch(
      new Request(`https://worker.example.com/email-detail/${detailToken}`),
      {
        TELEGRAM_BOT_TOKEN: "token",
        API_BASE_URL: "https://short.ly/v1",
        TGBOT_KV: {
          get: getMock,
          put: vi.fn(),
          delete: deleteMock,
        } as unknown as KVNamespace,
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("HTML 正文");
    expect(html).toContain("<iframe class=\"email-frame\"");
    expect(html).toContain("sandbox=\"allow-popups allow-popups-to-escape-sandbox\"");
    expect(html).toContain("&lt;strong&gt;Everything passed.&lt;/strong&gt;");
    expect(html).toContain("查看 HTML 源码");
  });
});
