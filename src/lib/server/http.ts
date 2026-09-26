// Kleine fetch-helper met timeout en duidelijke fouten.

export class ApiFout extends Error {
	constructor(
		message: string,
		public status = 0,
		public bron = ''
	) {
		super(message);
	}
}

export interface HaalOpties {
	timeoutMs?: number;
	headers?: Record<string, string>;
	method?: string;
	body?: string;
	bron?: string;
}

export async function haalJson<T>(url: string, opties: HaalOpties = {}): Promise<T> {
	const controller = new AbortController();
	const timeout = opties.timeoutMs ?? 10000;
	const timer = setTimeout(() => controller.abort(), timeout);
	let antwoord: Response;
	try {
		antwoord = await fetch(url, {
			method: opties.method ?? 'GET',
			headers: { accept: 'application/json', ...opties.headers },
			body: opties.body,
			signal: controller.signal
		});
	} catch (e) {
		clearTimeout(timer);
		if (controller.signal.aborted) {
			throw new ApiFout(`Geen antwoord binnen ${timeout / 1000} s`, 0, opties.bron);
		}
		throw new ApiFout(`Verbinding mislukt: ${(e as Error).message}`, 0, opties.bron);
	}
	try {
		if (!antwoord.ok) {
			let tekst = '';
			try {
				tekst = (await antwoord.text()).slice(0, 300);
			} catch {
				// negeren
			}
			throw new ApiFout(`HTTP ${antwoord.status} ${tekst}`.trim(), antwoord.status, opties.bron);
		}
		return (await antwoord.json()) as T;
	} catch (e) {
		if (e instanceof ApiFout) throw e;
		if (controller.signal.aborted) {
			throw new ApiFout(`Geen antwoord binnen ${timeout / 1000} s`, 0, opties.bron);
		}
		throw new ApiFout(`Ongeldig antwoord: ${(e as Error).message}`, antwoord.status, opties.bron);
	} finally {
		clearTimeout(timer);
	}
}

export function queryString(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
	const delen: string[] = [];
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null || v === '') continue;
		const waarde = Array.isArray(v) ? v.join(',') : String(v);
		delen.push(`${encodeURIComponent(k)}=${encodeURIComponent(waarde)}`);
	}
	return delen.join('&');
}

/**
 * Cache die isolates overleeft via de Cloudflare Cache API (caches.default),
 * met de in-memory cache als eerste laag. Buiten Workers alleen in-memory.
 */
export async function gedeeldGecached<T>(sleutel: string, seconden: number, maak: () => Promise<T>): Promise<T> {
	return gecached(sleutel, seconden, async () => {
		const cf = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
		const verzoek = new Request(`https://cache.betterov.intern/${encodeURIComponent(sleutel)}`);
		if (cf) {
			try {
				const hit = await cf.match(verzoek);
				if (hit) return (await hit.json()) as T;
			} catch {
				// cache is best effort
			}
		}
		const waarde = await maak();
		if (cf) {
			try {
				await cf.put(
					verzoek,
					new Response(JSON.stringify(waarde), {
						headers: { 'content-type': 'application/json', 'cache-control': `max-age=${seconden}` }
					})
				);
			} catch {
				// cache is best effort
			}
		}
		return waarde;
	});
}

/** Eenvoudige in-memory cache per isolate, met verlooptijd */
const geheugen = new Map<string, { tot: number; waarde: unknown }>();

export async function gecached<T>(sleutel: string, seconden: number, maak: () => Promise<T>): Promise<T> {
	const nu = Date.now();
	const hit = geheugen.get(sleutel);
	if (hit && hit.tot > nu) return hit.waarde as T;
	const waarde = await maak();
	geheugen.set(sleutel, { tot: nu + seconden * 1000, waarde });
	if (geheugen.size > 500) {
		for (const [k, v] of geheugen) if (v.tot <= nu) geheugen.delete(k);
		if (geheugen.size > 500) geheugen.delete(geheugen.keys().next().value as string);
	}
	return waarde;
}
