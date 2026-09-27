import type { Leg, TreinInfo } from '$lib/types';
import { api } from './api';

export function treinParams(l: Leg, extra: Record<string, string> = {}): string {
	return new URLSearchParams({
		naam: l.van.naam,
		lat: String(l.van.lat),
		lon: String(l.van.lon),
		datum: l.vertrek.gepland,
		naar: l.naar.naam,
		...(l.richting ? { richting: l.richting } : {}),
		...extra
	}).toString();
}

const cache = new Map<string, Promise<TreinInfo>>();

/** Treininformatie voor een NS-leg, één keer per minuut per rit opgehaald */
export function haalTreinInfo(l: Leg): Promise<TreinInfo> {
	const sleutel = `${l.ritnummer}|${l.van.naam}|${Math.floor(Date.now() / 60000)}`;
	let p = cache.get(sleutel);
	if (!p) {
		p = api<TreinInfo>(`/api/trein/${l.ritnummer}?${treinParams(l)}`, { timeoutMs: 12000 });
		p.catch(() => cache.delete(sleutel));
		cache.set(sleutel, p);
	}
	return p;
}
