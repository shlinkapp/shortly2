import PostalMime, { Email } from 'postal-mime';

interface Env {
	R2_BUCKET?: R2Bucket;
	APP_API_URL: string;
	INBOUND_EMAIL_SECRET: string;
	ENABLE_ATTACHMENTS?: string;
}

type ForwardedAttachment = {
	filename: string;
	mimeType: string;
	r2Path: string;
	size: number;
};

type ForwardedEmail = {
	from: string;
	fromName: string;
	to: string;
	subject: string;
	text: string;
	html: string;
	date: string | Date;
	messageId: string;
	cc: string;
	replyTo: string;
	headers: string;
	attachments: ForwardedAttachment[];
};

type ForwardableMessage = {
	raw: ReadableStream | ArrayBuffer | Uint8Array;
	from: string;
	to: string;
};

const worker = {
	async email(message: ForwardableMessage, env: Env): Promise<void> {
		let email: Email;

		try {
			email = await PostalMime.parse(message.raw);
		} catch (error) {
			console.error('Failed to parse inbound email for Shortly:', error);
			return;
		}

		const messageId = email.messageId?.trim() || '';
		const emailData: ForwardedEmail = {
			from: message.from,
			fromName: email.from?.name?.trim() || '',
			to: message.to,
			subject: email.subject?.trim() || '',
			text: email.text || '',
			html: email.html || '',
			date: email.date || '',
			messageId,
			cc: JSON.stringify(email.cc || []),
			replyTo: JSON.stringify(email.replyTo || []),
			headers: JSON.stringify(email.headers || []),
			attachments: await uploadAttachments(email, env, message.to, messageId),
		};

		await forwardToShortly(env.APP_API_URL, env.INBOUND_EMAIL_SECRET, emailData);
	},
};

export default worker;

async function uploadAttachments(
	email: Email,
	env: Env,
	toEmail: string,
	messageId: string,
): Promise<ForwardedAttachment[]> {
	if (env.ENABLE_ATTACHMENTS !== '1' || !email.attachments?.length) {
		return [];
	}

	if (!env.R2_BUCKET) {
		console.warn('ENABLE_ATTACHMENTS is enabled but R2_BUCKET is not configured. Skipping attachment uploads.');
		return [];
	}

	const now = new Date();
	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	const mailboxKey = sanitizePathSegment(toEmail);
	const messageKey = sanitizePathSegment(messageId || crypto.randomUUID());
	const attachments: ForwardedAttachment[] = [];

	for (const [index, attachment] of email.attachments.entries()) {
		const filename = attachment.filename?.trim() || `attachment-${index + 1}`;
		const r2Path = `${year}/${month}/${mailboxKey}/${messageKey}/${index + 1}-${sanitizeFilename(filename)}`;
		await env.R2_BUCKET.put(r2Path, attachment.content, {
			httpMetadata: {
				contentType: attachment.mimeType || 'application/octet-stream',
			},
		});

		attachments.push({
			filename,
			mimeType: attachment.mimeType || 'application/octet-stream',
			r2Path,
			size: getAttachmentSize(attachment.content),
		});
	}

	return attachments;
}

function getAttachmentSize(content: string | Uint8Array): number {
	return typeof content === 'string' ? new TextEncoder().encode(content).byteLength : content.byteLength;
}

function sanitizeFilename(value: string): string {
	const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	return sanitized || 'attachment';
}

function sanitizePathSegment(value: string): string {
	const sanitized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	return sanitized || 'unknown';
}

async function forwardToShortly(
	apiUrl: string,
	inboundEmailSecret: string,
	emailData: ForwardedEmail,
): Promise<void> {
	try {
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-inbound-email-secret': inboundEmailSecret,
			},
			body: JSON.stringify(emailData),
		});

		if (!response.ok) {
			const responseText = await response.text().catch(() => '');
			console.error('Shortly inbound email API returned a non-2xx response.', {
				status: response.status,
				statusText: response.statusText,
				body: responseText.slice(0, 500),
				to: emailData.to,
				messageId: emailData.messageId,
			});
		}
	} catch (error) {
		console.error('Failed to forward inbound email to Shortly:', error);
	}
}
