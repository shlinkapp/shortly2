import PostalMime, { Email } from 'postal-mime';

interface Env {
	R2_BUCKET: R2Bucket;
	APP_API_URL: string;
	INBOUND_EMAIL_SECRET: string;
	ENABLE_ATTACHMENTS: string;
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
			console.error('Failed to parse email:', error);
			return;
		}

		const emailData: ForwardedEmail = {
			from: message.from,
			fromName: email.from.name || '',
			to: message.to,
			subject: email.subject || 'No Subject',
			text: email.text || '',
			html: email.html || '',
			date: email.date || '',
			messageId: email.messageId || '',
			cc: JSON.stringify(email.cc || []),
			replyTo: JSON.stringify(email.replyTo || ''),
			headers: JSON.stringify(email.headers || []),
			attachments: [],
		};

		if (env.ENABLE_ATTACHMENTS === '1' && email.attachments && email.attachments.length > 0) {
			const date = new Date();
			const year = date.getUTCFullYear();
			const month = date.getUTCMonth() + 1;

			for (const attachment of email.attachments) {
				const r2Path = `${year}/${month}/${attachment.filename}`;
				if (env.R2_BUCKET) {
					await env.R2_BUCKET.put(r2Path, attachment.content);
				}

				const size =
					typeof attachment.content === 'string'
						? attachment.content.length
						: attachment.content.byteLength;

				emailData.attachments.push({
					filename: attachment.filename || 'untitled',
					mimeType: attachment.mimeType || 'application/octet-stream',
					r2Path,
					size,
				});
			}
		}

		await forwardToApp(env.APP_API_URL, env.INBOUND_EMAIL_SECRET, emailData);
	},
};

export default worker;

async function forwardToApp(
	apiUrl: string,
	inboundEmailSecret: string,
	emailData: ForwardedEmail,
): Promise<void> {
	try {
		await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-inbound-email-secret': inboundEmailSecret,
			},
			body: JSON.stringify(emailData),
		});
	} catch (error) {
		console.log('Error forwarding email:', error);
	}
}
