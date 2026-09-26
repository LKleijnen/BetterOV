// Pushmeldingen via Firebase Cloud Messaging (HTTP v1 API).

import { toegangstoken, type ServiceAccount } from './google';

export interface PushBericht {
	titel: string;
	tekst: string;
	/** Pad in de app dat opent bij tikken, bijvoorbeeld "/reis" */
	url: string;
	/** Meldingen met dezelfde tag vervangen elkaar */
	tag?: string;
}

export type PushResultaat = 'ok' | 'ongeldig' | 'fout';

export async function stuurPush(sa: ServiceAccount, token: string, b: PushBericht, appUrl?: string): Promise<PushResultaat> {
	const toegang = await toegangstoken(sa);
	const link = appUrl ? new URL(b.url, appUrl).toString() : b.url;
	const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
		method: 'POST',
		headers: { authorization: `Bearer ${toegang}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			message: {
				token,
				// Alleen data: onze eigen service worker toont de melding (ook op iOS)
				data: { titel: b.titel, tekst: b.tekst, url: b.url, tag: b.tag ?? 'reis' },
				webpush: {
					headers: { Urgency: 'high', TTL: '600' },
					fcm_options: appUrl ? { link } : undefined
				}
			}
		})
	});
	if (r.ok) return 'ok';
	if (r.status === 404 || r.status === 400) {
		const tekst = await r.text();
		if (/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(tekst)) return 'ongeldig';
	}
	return 'fout';
}
