// Uitnodigingslinks: een beheerder maakt een link, de ontvanger logt in met Google en staat daarna
// op de allowlist. Een link werkt één keer en verloopt na 7 dagen. In Firestore staat alleen een
// hash van de code, zodat de database zelf geen bruikbare links bevat.

import { ApiFout } from './http';
import type { Firestore, FsDocument } from './firestore';
import { normaliseerEmail } from './auth';

export const GELDIG_DAGEN = 7;
const COLLECTIE = 'uitnodigingen';

export interface Uitnodiging {
	aangemaaktOp: string;
	aangemaaktDoor?: string;
	verlooptOp: string;
	/** Voor wie de link bedoeld is, alleen ter herkenning voor de beheerder */
	notitie?: string;
	gebruiktOp?: string;
	gebruiktDoor?: string;
}

export type UitnodigingStatus = 'open' | 'gebruikt' | 'verlopen';

export function status(u: Uitnodiging, nu = Date.now()): UitnodigingStatus {
	if (u.gebruiktOp) return 'gebruikt';
	return Date.parse(u.verlooptOp) < nu ? 'verlopen' : 'open';
}

/** Onraadbare code (192 bits), veilig in een URL */
export function nieuweCode(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function codeHash(code: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function geldigeCode(code: unknown): code is string {
	return typeof code === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(code);
}

type Opslag = Pick<Firestore, 'get' | 'zet' | 'lijst' | 'verwijder'>;

export async function maakUitnodiging(fs: Opslag, door: string | undefined, notitie?: string, nu = Date.now()): Promise<string> {
	const code = nieuweCode();
	const u: Uitnodiging = {
		aangemaaktOp: new Date(nu).toISOString(),
		aangemaaktDoor: door,
		verlooptOp: new Date(nu + GELDIG_DAGEN * 86400000).toISOString(),
		notitie: notitie?.trim().slice(0, 60) || undefined
	};
	await fs.zet(`${COLLECTIE}/${await codeHash(code)}`, { ...u });
	return code;
}

export async function lijstUitnodigingen(fs: Opslag): Promise<FsDocument<Uitnodiging>[]> {
	const docs = await fs.lijst<Uitnodiging>(COLLECTIE, 100);
	return docs.sort((a, b) => b.data.aangemaaktOp.localeCompare(a.data.aangemaaktOp));
}

export async function trekIn(fs: Opslag, id: string): Promise<void> {
	if (!/^[0-9a-f]{64}$/.test(id)) throw new ApiFout('Ongeldige uitnodiging.', 400);
	await fs.verwijder(`${COLLECTIE}/${id}`);
}

export type Inwisseling = { ok: true } | { ok: false; reden: 'ongeldig' | 'gebruikt' | 'verlopen' };

/**
 * Wisselt een code in voor toegang. Het markeren als gebruikt gebeurt met een voorwaarde op de
 * laatste wijziging, zodat twee mensen die tegelijk dezelfde link openen niet allebei binnenkomen.
 */
export async function wisselIn(fs: Opslag, code: string, email: string, nu = Date.now()): Promise<Inwisseling> {
	if (!geldigeCode(code)) return { ok: false, reden: 'ongeldig' };
	const pad = `${COLLECTIE}/${await codeHash(code)}`;
	const doc = await fs.get<Uitnodiging>(pad);
	if (!doc) return { ok: false, reden: 'ongeldig' };
	const u = doc.data;
	if (u.gebruiktOp) {
		// Dezelfde persoon die nog eens tikt: gewoon goed
		return u.gebruiktDoor && normaliseerEmail(u.gebruiktDoor) === normaliseerEmail(email) ? { ok: true } : { ok: false, reden: 'gebruikt' };
	}
	if (status(u, nu) === 'verlopen') return { ok: false, reden: 'verlopen' };
	try {
		await fs.zet(pad, { gebruiktOp: new Date(nu).toISOString(), gebruiktDoor: email }, ['gebruiktOp', 'gebruiktDoor'], doc.updateTime);
	} catch (e) {
		// Voorwaarde mislukt: iemand anders was net eerder
		if (e instanceof ApiFout && (e.status === 400 || e.status === 409 || e.status === 412)) return { ok: false, reden: 'gebruikt' };
		throw e;
	}
	const regel = { toegevoegdOp: new Date(nu).toISOString(), toegevoegdDoor: 'uitnodigingslink' };
	await fs.zet(`allowlist/${email}`, regel);
	const genormaliseerd = normaliseerEmail(email);
	if (genormaliseerd !== email) await fs.zet(`allowlist/${genormaliseerd}`, regel);
	return { ok: true };
}
