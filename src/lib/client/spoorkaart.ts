// Spoorkaart in de app: eenmalig ophalen (de browser bewaart hem een dag) en treinritten over het spoor tekenen.

import type { Leg } from '$lib/types';
import { isGrof, leesSpoorkaart, maakNetwerk, spoorRoute, type Punt, type SpoorNetwerk } from '$lib/spoor';
import { legLijn } from '$lib/voertuig';
import { api } from './api';

let laden: Promise<SpoorNetwerk | null> | undefined;

/** Het spoornetwerk, of null als de spoorkaart (nog) niet beschikbaar is */
export function spoorNetwerk(): Promise<SpoorNetwerk | null> {
	laden ??= api<unknown>('/api/spoorkaart', { timeoutMs: 20000 })
		.then((ruw) => {
			const lijnen = leesSpoorkaart(ruw);
			return lijnen.length ? maakNetwerk(lijnen) : null;
		})
		.catch(() => {
			// Volgende keer opnieuw proberen
			laden = undefined;
			return null;
		});
	return laden;
}

const routes = new Map<string, Punt[] | null>();

/** Heeft deze rit baat bij de spoorkaart (trein zonder nauwkeurige vorm)? */
export function wilSpoor(leg: Leg): boolean {
	return leg.modus === 'trein' && isGrof(legLijn(leg), leg.tussenstops.length + 2);
}

/** Lijn van een rit: over het spoor als dat kan, anders de vorm uit de reisplanner */
export function lijnOverSpoor(leg: Leg, netwerk: SpoorNetwerk | null): Punt[] {
	if (!netwerk || !wilSpoor(leg)) return legLijn(leg);
	const sleutel = `${leg.tripId ?? leg.ritnummer ?? ''}|${leg.van.naam}|${leg.naar.naam}|${leg.tussenstops.length}`;
	if (!routes.has(sleutel)) routes.set(sleutel, spoorRoute(netwerk, [leg.van, ...leg.tussenstops, leg.naar]));
	return routes.get(sleutel) ?? legLijn(leg);
}

/** Zoals lijnOverSpoor, maar haalt de spoorkaart zelf op als dat nodig is */
export async function legLijnOverSpoor(leg: Leg): Promise<Punt[]> {
	return lijnOverSpoor(leg, wilSpoor(leg) ? await spoorNetwerk() : null);
}
