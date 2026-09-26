// Aanroepen van de eigen API met login-token, timeout en een cache voor slecht bereik.

import { lees, schrijf } from './opslag';

export class ApiFout extends Error {
	constructor(
		message: string,
		public status = 0
	) {
		super(message);
	}
}

let tokenBron: (() => Promise<string | null>) | undefined;

export function zetTokenBron(bron: () => Promise<string | null>) {
	tokenBron = bron;
}

export async function api<T>(
	pad: string,
	init: { methode?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
	const headers: Record<string, string> = { accept: 'application/json' };
	const token = tokenBron ? await tokenBron().catch(() => null) : null;
	if (token) headers.authorization = `Bearer ${token}`;
	if (init.body !== undefined) headers['content-type'] = 'application/json';
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20000);
	let r: Response;
	try {
		r = await fetch(pad, {
			method: init.methode ?? (init.body !== undefined ? 'POST' : 'GET'),
			headers,
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
			signal: controller.signal
		});
	} catch {
		throw new ApiFout(
			typeof navigator !== 'undefined' && !navigator.onLine
				? 'Geen internetverbinding.'
				: 'Geen verbinding met de server.',
			0
		);
	} finally {
		clearTimeout(timer);
	}
	const data = (await r.json().catch(() => null)) as (T & { fout?: string }) | null;
	if (!r.ok) throw new ApiFout(data?.fout ?? `Fout ${r.status}`, r.status);
	return data as T;
}

export interface Gecachet<T> {
	data: T;
	/** Tijdstip waarop de data van de server kwam */
	opgehaaldOp: string;
	/** true als de verse aanvraag mislukte en dit oude data is */
	uitCache: boolean;
	fout?: string;
}

const MAX_CACHE = 25;

/** Haalt data op; bij een fout wordt de laatst bekende versie teruggegeven (M12) */
export async function metCache<T>(sleutel: string, haal: () => Promise<T>): Promise<Gecachet<T>> {
	const k = `cache:${sleutel}`;
	try {
		const data = await haal();
		const opgehaaldOp = new Date().toISOString();
		schrijf(k, { data, opgehaaldOp });
		const index = lees<string[]>('cache-index', []).filter((x) => x !== k);
		index.push(k);
		while (index.length > MAX_CACHE) {
			const oud = index.shift()!;
			try {
				localStorage.removeItem(oud);
			} catch {
				// negeren
			}
		}
		schrijf('cache-index', index);
		return { data, opgehaaldOp, uitCache: false };
	} catch (e) {
		const oud = lees<{ data: T; opgehaaldOp: string } | null>(k, null);
		if (oud) return { ...oud, uitCache: true, fout: (e as Error).message };
		throw e;
	}
}

export function uitCache<T>(sleutel: string): { data: T; opgehaaldOp: string } | null {
	return lees<{ data: T; opgehaaldOp: string } | null>(`cache:${sleutel}`, null);
}
