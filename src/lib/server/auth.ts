// Controle van Firebase ID-tokens en de allowlist.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { gecached } from './http';
import { Firestore } from './firestore';
import type { ServiceAccount } from './google';

const JWKS = createRemoteJWKSet(
	new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface Gebruiker {
	uid: string;
	email: string;
	naam?: string;
}

export async function controleerIdToken(token: string, projectId: string): Promise<Gebruiker | null> {
	try {
		const { payload } = await jwtVerify(token, JWKS, {
			issuer: `https://securetoken.google.com/${projectId}`,
			audience: projectId,
			algorithms: ['RS256']
		});
		if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) return null;
		return {
			uid: payload.sub,
			email: payload.email.toLowerCase(),
			naam: typeof payload.name === 'string' ? payload.name : undefined
		};
	} catch {
		return null;
	}
}

export function beheerders(lijst: string | undefined): string[] {
	return (lijst ?? '')
		.split(/[,;\s]+/)
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

/** Staat dit e-mailadres op de allowlist? Beheerders altijd wel. Resultaat 5 min gecachet. */
export async function opAllowlist(email: string, sa: ServiceAccount | undefined, admins: string[]): Promise<boolean> {
	if (admins.includes(email)) return true;
	if (!sa) return false;
	return gecached(`allowlist:${email}`, 300, async () => {
		const doc = await new Firestore(sa).get(`allowlist/${email}`);
		return !!doc;
	});
}
