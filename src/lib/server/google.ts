// OAuth-toegangstokens voor Google-API's (Firestore, FCM) met een service account.
// Werkt in Cloudflare Workers via WebCrypto (jose), zonder Admin SDK.

import { importPKCS8, SignJWT } from 'jose';
import { ApiFout } from './http';

export interface ServiceAccount {
	project_id: string;
	client_email: string;
	private_key: string;
}

export function leesServiceAccount(json: string | undefined): ServiceAccount | undefined {
	if (!json) return undefined;
	try {
		// Ook base64 toestaan, handig als een secret geen nieuwe regels mag bevatten
		const tekst = json.trim().startsWith('{') ? json : atob(json.trim());
		const sa = JSON.parse(tekst) as ServiceAccount;
		if (!sa.client_email || !sa.private_key || !sa.project_id) return undefined;
		sa.private_key = sa.private_key.replace(/\\n/g, '\n');
		return sa;
	} catch {
		return undefined;
	}
}

const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging';

let tokenCache: { email: string; token: string; tot: number } | undefined;

export async function toegangstoken(sa: ServiceAccount): Promise<string> {
	const nu = Math.floor(Date.now() / 1000);
	if (tokenCache && tokenCache.email === sa.client_email && tokenCache.tot > nu + 60) return tokenCache.token;
	const sleutel = await importPKCS8(sa.private_key, 'RS256');
	const assertion = await new SignJWT({ scope: SCOPES })
		.setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
		.setIssuer(sa.client_email)
		.setSubject(sa.client_email)
		.setAudience('https://oauth2.googleapis.com/token')
		.setIssuedAt(nu)
		.setExpirationTime(nu + 3600)
		.sign(sleutel);
	const antwoord = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
	});
	if (!antwoord.ok) throw new ApiFout(`Google-token mislukt: HTTP ${antwoord.status}`, antwoord.status, 'google');
	const data = (await antwoord.json()) as { access_token: string; expires_in: number };
	tokenCache = { email: sa.client_email, token: data.access_token, tot: nu + data.expires_in };
	return data.access_token;
}
