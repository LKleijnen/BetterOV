import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { motisZoek } from '$lib/server/motis';
import { nsStations } from '$lib/server/ns';
import { mockZoek } from '$lib/server/mock';
import { foutAntwoord, getal } from '$lib/server/antwoord';
import type { Plek } from '$lib/types';
import type { RequestHandler } from './$types';

/** Zoek adressen, haltes, stations en plekken */
export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	const lat = getal(url.searchParams.get('lat'));
	const lon = getal(url.searchParams.get('lon'));
	const c = config();
	if (c.mock) return json(mockZoek(q));
	try {
		return json(await motisZoek(q, lat !== undefined && lon !== undefined ? { lat, lon } : undefined));
	} catch (e) {
		// Terugval: NS-stations op naam
		const stations = await nsStations(c.nsKey).catch(() => []);
		const t = q.toLowerCase();
		const treffers: Plek[] = stations
			.filter((s) => [s.naam, s.middel, s.kort, ...s.synoniemen].some((n) => n?.toLowerCase().includes(t)))
			.slice(0, 8)
			.map((s) => ({ naam: s.naam, lat: s.lat, lon: s.lon, type: 'station' }));
		if (treffers.length) return json(treffers);
		return foutAntwoord(e, 'Zoeken mislukt.');
	}
};
