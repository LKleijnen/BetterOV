// Controle van Firebase ID-tokens en de allowlist.

import { createRemoteJWKSet, jwtVerify } from 'jose';
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

/**
 * Vergelijkbare vorm van een e-mailadres. Voor Gmail tellen puntjes en "+label" niet mee:
 * kleijnen.lars@gmail.com en kleijnenlars@gmail.com zijn hetzelfde account.
 */
export function normaliseerEmail(email: string): string {
	const schoon = email.trim().toLowerCase();
	const [lokaal, domein] = schoon.split('@');
	if (!lokaal || !domein) return schoon;
	if (domein === 'gmail.com' || domein === 'googlemail.com') {
		return `${lokaal.split('+')[0].replace(/\./g, '')}@gmail.com`;
	}
	return schoon;
}

/**
 * E-mailadressen uit ADMIN_EMAILS, genormaliseerd. Tolerant voor aanhalingstekens,
 * spaties, komma's, "ADMIN_EMAILS=" ervoor of "Naam <adres>".
 */
export function beheerders(lijst: string | undefined): string[] {
	const gevonden = (lijst ?? '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
	return [...new Set(gevonden.map(normaliseerEmail))];
}

export function isBeheerder(email: string, admins: string[]): boolean {
	return admins.includes(normaliseerEmail(email));
}

export interface AllowlistUitslag {
	toegestaan: boolean;
	/** Reden als de controle zelf misging (niet: "staat er niet op") */
	fout?: string;
}

const allowlistCache = new Map<string, { tot: number; toegestaan: boolean }>();

/** Vergeet het onthouden antwoord, bijvoorbeeld direct nadat iemand een uitnodiging heeft gebruikt */
export function vergeetToegang(email: string) {
	allowlistCache.delete(email);
}

/**
 * Staat dit e-mailadres op de allowlist? Beheerders altijd wel. Zoekt zowel op het exacte
 * adres als op de genormaliseerde vorm. Een "ja" wordt 5 minuten onthouden, een "nee" 5 seconden
 * (kort, zodat iemand die net een uitnodiging gebruikte snel binnen is).
 */
export async function controleerAllowlist(email: string, sa: ServiceAccount | undefined, admins: string[]): Promise<AllowlistUitslag> {
	if (isBeheerder(email, admins)) return { toegestaan: true };
	if (!sa) return { toegestaan: false, fout: 'FIREBASE_SERVICE_ACCOUNT ontbreekt of is ongeldig.' };
	const hit = allowlistCache.get(email);
	if (hit && hit.tot > Date.now()) return { toegestaan: hit.toegestaan };
	try {
		const fs = new Firestore(sa);
		let toegestaan = !!(await fs.get(`allowlist/${email}`));
		const genormaliseerd = normaliseerEmail(email);
		if (!toegestaan && genormaliseerd !== email) toegestaan = !!(await fs.get(`allowlist/${genormaliseerd}`));
		allowlistCache.set(email, { tot: Date.now() + (toegestaan ? 300 : 5) * 1000, toegestaan });
		return { toegestaan };
	} catch (e) {
		return { toegestaan: false, fout: `Uitnodigingslijst lezen mislukt: ${(e as Error).message}` };
	}
}
