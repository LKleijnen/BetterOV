import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { treinInfo } from '$lib/server/trein';
import { mockTrein } from '$lib/server/mock';
import { foutAntwoord, getal } from '$lib/server/antwoord';
import type { RequestHandler } from './$types';

/**
 * Samenstelling, drukte, lengte t.o.v. normaal en materieel van een NS-trein.
 * Parameters: station (code), naam, lat, lon (instapstation), datum (ISO), ruw=1
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const ritnummer = params.ritnummer;
	if (!/^\d{1,6}$/.test(ritnummer)) return json({ fout: 'Ongeldig ritnummer.' }, { status: 400 });
	const c = config();
	if (c.mock) return json(mockTrein(ritnummer));
	if (!c.nsKey) return json({ fout: 'NS API-key is nog niet ingesteld.' }, { status: 503 });
	const p = url.searchParams;
	try {
		return json(
			await treinInfo(c.nsKey, ritnummer, {
				stationCode: p.get('station') || undefined,
				stationNaam: p.get('naam') || undefined,
				lat: getal(p.get('lat')),
				lon: getal(p.get('lon')),
				datumTijd: p.get('datum') || undefined,
				ruw: p.get('ruw') === '1'
			})
		);
	} catch (e) {
		return foutAntwoord(e, 'Treininformatie ophalen mislukt.');
	}
};
