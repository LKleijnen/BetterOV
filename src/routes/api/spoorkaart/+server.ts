import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { nsSpoorkaart } from '$lib/server/ns';
import { mockSpoorkaart } from '$lib/server/mock';
import { foutAntwoord } from '$lib/server/antwoord';
import type { RequestHandler } from './$types';

// Mag een dag in de browser blijven: de spoorkaart verandert hooguit per maand
const CACHE = 'private, max-age=86400';

/** Alle spoorlijnen (NS SpoorKaart, GeoJSON), zodat de kaart treinen over het spoor tekent */
export const GET: RequestHandler = async () => {
	const c = config();
	if (c.mock) return json(mockSpoorkaart(), { headers: { 'cache-control': CACHE } });
	if (!c.nsKey) return json({ fout: 'NS API-key is nog niet ingesteld.' }, { status: 503 });
	try {
		return new Response(await nsSpoorkaart(c.nsKey), {
			headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE }
		});
	} catch (e) {
		return foutAntwoord(e, 'Spoorkaart ophalen mislukt.');
	}
};
