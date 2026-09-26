import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { motisOmgekeerd } from '$lib/server/motis';
import { getal } from '$lib/server/antwoord';
import type { RequestHandler } from './$types';

/** Adres bij een GPS-positie (voor een leesbare naam van "Huidige locatie") */
export const GET: RequestHandler = async ({ url }) => {
	const lat = getal(url.searchParams.get('lat'));
	const lon = getal(url.searchParams.get('lon'));
	if (lat === undefined || lon === undefined) return json({ fout: 'lat en lon zijn verplicht' }, { status: 400 });
	if (config().mock) return json({ naam: 'Oudegracht 100', omschrijving: 'Utrecht', lat, lon, type: 'gps' });
	try {
		const p = await motisOmgekeerd(lat, lon);
		return json(p ? { ...p, lat, lon, type: 'gps' } : null);
	} catch {
		return json(null);
	}
};
