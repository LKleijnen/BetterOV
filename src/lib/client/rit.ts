// De volledige rit van een trein, bus of tram (alle haltes, ook vóór je instapt en na je uitstapt),
// voor de kaart en de live positie. Eén keer per rit opgehaald en vijf minuten onthouden.

import type { Leg } from '$lib/types';
import { isOV } from '$lib/reis';
import { api } from './api';

const cache = new Map<string, { tot: number; rit: Promise<Leg | null> }>();

export function volledigeRit(leg: Leg | undefined): Promise<Leg | null> {
	if (!leg || !isOV(leg) || (!leg.tripId && !leg.ritnummer)) return Promise.resolve(null);
	const sleutel = leg.tripId ?? `${leg.ritnummer}|${leg.vertrek.gepland.slice(0, 10)}`;
	const bewaard = cache.get(sleutel);
	if (bewaard && bewaard.tot > Date.now()) return bewaard.rit;
	const p = new URLSearchParams();
	if (leg.tripId) p.set('tripId', leg.tripId);
	if (leg.ritnummer) p.set('ritnummer', leg.ritnummer);
	p.set('datum', leg.vertrek.gepland);
	// Alleen gebruikt door de nepdata (om er een rit omheen te maken)
	for (const [k, h, t] of [
		['van', leg.van, leg.vertrek.verwacht],
		['naar', leg.naar, leg.aankomst.verwacht]
	] as const) {
		p.set(`${k}Naam`, h.naam);
		p.set(`${k}Lat`, String(h.lat));
		p.set(`${k}Lon`, String(h.lon));
		p.set(`${k}Tijd`, t);
	}
	const rit = api<{ leg: Leg }>(`/api/rit?${p}`, { timeoutMs: 12000 })
		.then((r) => (r.leg && r.leg.tussenstops.length + 2 >= leg.tussenstops.length + 2 ? r.leg : null))
		.catch(() => {
			cache.delete(sleutel);
			return null;
		});
	cache.set(sleutel, { tot: Date.now() + 5 * 60000, rit });
	return rit;
}

/** Volledige ritten bij alle ritten van een reis (null bij lopen of als hij niet te vinden is) */
export function volledigeRitten(legs: Leg[]): Promise<(Leg | null)[]> {
	return Promise.all(legs.map((l) => volledigeRit(l)));
}
