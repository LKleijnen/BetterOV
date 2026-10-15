// MCP-sleutels: persoonlijke sleutels waarmee een AI-assistent (via /api/mcp) namens jou mag
// plannen en meekijken. In Firestore staat alleen een SHA-256 van de sleutel, plus het uid en
// e-mailadres van de eigenaar. De sleutel zelf is dus alleen te zien op het moment van maken.

import { ApiFout } from './http';
import type { Firestore, FsDocument } from './firestore';
import { nieuwGeheim, sha256 } from './geheim';

const COLLECTIE = 'mcpSleutels';

/** Zo begint elke sleutel; daarmee weet de server dat dit geen Firebase-token is */
export const SLEUTEL_PREFIX = 'bov_';

export interface McpSleutel {
	uid: string;
	email: string;
	/** Naam van het apparaat of de assistent, ter herkenning voor de eigenaar */
	naam?: string;
	aangemaaktOp: string;
	laatstGebruiktOp?: string;
	/** Laatste vier tekens, zodat je in de lijst ziet welke sleutel welke is */
	staart: string;
}

type Opslag = Pick<Firestore, 'get' | 'zet' | 'zoek' | 'verwijder'>;

export function nieuweSleutel(): string {
	return `${SLEUTEL_PREFIX}${nieuwGeheim()}`;
}

export function geldigeSleutel(sleutel: unknown): sleutel is string {
	return typeof sleutel === 'string' && new RegExp(`^${SLEUTEL_PREFIX}[A-Za-z0-9_-]{20,64}$`).test(sleutel);
}

export function sleutelHash(sleutel: string): Promise<string> {
	return sha256(sleutel);
}

/** Maakt een sleutel aan en geeft hem één keer terug */
export async function maakSleutel(
	fs: Opslag,
	eigenaar: { uid: string; email: string },
	naam?: string,
	nu = Date.now()
): Promise<{ sleutel: string; id: string }> {
	const sleutel = nieuweSleutel();
	const id = await sleutelHash(sleutel);
	const rij: McpSleutel = {
		uid: eigenaar.uid,
		email: eigenaar.email,
		naam: naam?.trim().slice(0, 40) || undefined,
		aangemaaktOp: new Date(nu).toISOString(),
		staart: sleutel.slice(-4)
	};
	await fs.zet(`${COLLECTIE}/${id}`, { ...rij });
	return { sleutel, id };
}

export async function lijstSleutels(fs: Opslag, uid: string): Promise<FsDocument<McpSleutel>[]> {
	const docs = await fs.zoek<McpSleutel>(COLLECTIE, 'uid', 'EQUAL', uid, 50);
	return docs.sort((a, b) => (b.data.aangemaaktOp ?? '').localeCompare(a.data.aangemaaktOp ?? ''));
}

/** Trekt een sleutel in; alleen de eigenaar mag dat */
export async function trekSleutelIn(fs: Opslag, uid: string, id: string): Promise<void> {
	if (!/^[0-9a-f]{64}$/.test(id)) throw new ApiFout('Ongeldige sleutel.', 400);
	const doc = await fs.get<McpSleutel>(`${COLLECTIE}/${id}`);
	if (!doc || doc.data.uid !== uid) throw new ApiFout('Deze sleutel bestaat niet.', 404);
	await fs.verwijder(`${COLLECTIE}/${id}`);
}

/** Niet elke aanroep een schrijfactie: alleen als het laatste gebruik een uur oud is */
const BIJWERKEN_NA_MS = 3600_000;

/**
 * Bij welke gebruiker hoort deze sleutel? Geeft null als hij niet bestaat.
 * Werkt "laatst gebruikt" bij, zodat je in de app ziet of een sleutel nog in gebruik is.
 */
export async function eigenaarVanSleutel(
	fs: Opslag,
	sleutel: string,
	nu = Date.now()
): Promise<{ uid: string; email: string; naam?: string } | null> {
	if (!geldigeSleutel(sleutel)) return null;
	const id = await sleutelHash(sleutel);
	const doc = await fs.get<McpSleutel>(`${COLLECTIE}/${id}`);
	if (!doc?.data.uid || !doc.data.email) return null;
	const vorige = doc.data.laatstGebruiktOp ? Date.parse(doc.data.laatstGebruiktOp) : 0;
	if (!(vorige > nu - BIJWERKEN_NA_MS)) {
		await fs.zet(`${COLLECTIE}/${id}`, { laatstGebruiktOp: new Date(nu).toISOString() }, ['laatstGebruiktOp']).catch(() => {});
	}
	return { uid: doc.data.uid, email: doc.data.email, naam: doc.data.naam };
}
