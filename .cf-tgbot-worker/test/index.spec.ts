import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import worker from "../src/index";

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
});
