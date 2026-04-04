import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index';

describe('Shortly email inbound worker', () => {
	const originalFetch = globalThis.fetch;
	const originalConsoleError = console.error;
	const originalConsoleWarn = console.warn;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		console.error = originalConsoleError;
		console.warn = originalConsoleWarn;
	});

	it('forwards parsed email to Shortly inbound API', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;

		await worker.email(
			{
				from: 'sender@example.com',
				to: 'inbox@example.com',
				raw: new TextEncoder().encode(
					[
						'From: Example Sender <sender@example.com>',
						'To: inbox@example.com',
						'Subject: Test email',
						'Message-ID: <msg-123@example.com>',
						'Date: Tue, 01 Apr 2025 10:00:00 +0000',
						'',
						'Hello Shortly',
					].join('\r\n'),
				),
			},
			{
				APP_API_URL: 'https://short.ly/v1/emails/inbound',
				INBOUND_EMAIL_SECRET: 'secret',
				ENABLE_ATTACHMENTS: '0',
			},
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://short.ly/v1/emails/inbound');
		expect(init.headers).toMatchObject({
			'Content-Type': 'application/json',
			'x-inbound-email-secret': 'secret',
		});

		const body = JSON.parse(String(init.body));
		expect(body).toMatchObject({
			from: 'sender@example.com',
			fromName: 'Example Sender',
			to: 'inbox@example.com',
			subject: 'Test email',
			messageId: '<msg-123@example.com>',
			attachments: [],
			cc: '[]',
			replyTo: '[]',
			html: '',
		});
		expect(body.text.trim()).toBe('Hello Shortly');
		expect(JSON.parse(body.headers)).toHaveLength(5);
	});

	it('uploads attachments to R2 when enabled', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const putMock = vi.fn().mockResolvedValue(undefined);
		globalThis.fetch = fetchMock as typeof fetch;

		await worker.email(
			{
				from: 'sender@example.com',
				to: 'team@example.com',
				raw: new TextEncoder().encode(
					[
						'From: Example Sender <sender@example.com>',
						'To: team@example.com',
						'Subject: Attachment email',
						'Message-ID: <msg-with-attachment@example.com>',
						'MIME-Version: 1.0',
						'Content-Type: multipart/mixed; boundary="test-boundary"',
						'',
						'--test-boundary',
						'Content-Type: text/plain; charset="UTF-8"',
						'',
						'Attachment body',
						'--test-boundary',
						'Content-Type: text/plain; name="hello.txt"',
						'Content-Disposition: attachment; filename="hello.txt"',
						'Content-Transfer-Encoding: base64',
						'',
						'SGVsbG8gYXR0YWNobWVudA==',
						'--test-boundary--',
					].join('\r\n'),
				),
			},
			{
				APP_API_URL: 'https://short.ly/v1/emails/inbound',
				INBOUND_EMAIL_SECRET: 'secret',
				ENABLE_ATTACHMENTS: '1',
				R2_BUCKET: { put: putMock } as R2Bucket,
			},
		);

		expect(putMock).toHaveBeenCalledTimes(1);
		const [r2Path] = putMock.mock.calls[0] as [string];
		expect(r2Path).toContain('/team-example.com/');
		expect(r2Path).toContain('/1-hello.txt');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body));
		expect(body.attachments).toHaveLength(1);
		expect(body.attachments[0]).toMatchObject({
			filename: 'hello.txt',
			mimeType: 'text/plain',
			r2Path,
		});
	});

	it('logs when Shortly returns a non-2xx response', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));
		const errorSpy = vi.fn();
		globalThis.fetch = fetchMock as typeof fetch;
		console.error = errorSpy;

		await worker.email(
			{
				from: 'sender@example.com',
				to: 'inbox@example.com',
				raw: new TextEncoder().encode('From: sender@example.com\r\nTo: inbox@example.com\r\n\r\nHello'),
			},
			{
				APP_API_URL: 'https://short.ly/v1/emails/inbound',
				INBOUND_EMAIL_SECRET: 'wrong-secret',
				ENABLE_ATTACHMENTS: '0',
			},
		);

		expect(errorSpy).toHaveBeenCalled();
		expect(errorSpy.mock.calls[0]?.[0]).toContain('Shortly inbound email API returned a non-2xx response.');
	});
});
