import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { treinInfo } from '$lib/server/trein';
import { mockTrein } from '$lib/server/mock';
import { foutAntwoord, getal } from '$lib/server/antwoord';
import { Firestore } from '$lib/server/firestore';
import { logRit } from '$lib/server/materieel';
import type { RequestHandler } from './$types';

/**
 * Samenstelling, drukte, lengte t.o.v. normaal en materieel van een NS-trein.
 * Parameters: station (code), naam, lat, lon (instapstation), datum (ISO), naar (uitstapstation),
 * richting, ruw=1
 */
export const GET: RequestHandler = async ({ params, url, platform }) => {
	const ritnummer = params.ritnummer;
	if (!/^\d{1,6}$/.test(ritnummer)) return json({ fout: 'Ongeldig ritnummer.' }, { status: 400 });
	const c = config();
	if (c.mock) return json(mockTrein(ritnummer));
	if (!c.nsKey) return json({ fout: 'NS API-key is nog niet ingesteld.' }, { status: 503 });
	const p = url.searchParams;
	try {
		const info = await treinInfo(c.nsKey, ritnummer, {
				stationCode: p.get('station') || undefined,
				stationNaam: p.get('naam') || undefined,
				lat: getal(p.get('lat')),
				lon: getal(p.get('lon')),
				datumTijd: p.get('datum') || undefined,
				naar: p.get('naar') || undefined,
				richting: p.get('richting') || undefined,
				ruw: p.get('ruw') === '1'
			});
		// Eerder gereden ritten per treinstel bijhouden, zonder het antwoord op te houden
		if (c.serviceAccount && info.delen.some((d) => d.nummer)) {
			const log = logRit(new Firestore(c.serviceAccount), info, p.get('datum') || undefined).catch((e) => console.warn('Ritlog mislukt', e));
			if (platform?.ctx) platform.ctx.waitUntil(log);
		}
		return json(info);
	} catch (e) {
		return foutAntwoord(e, 'Treininformatie ophalen mislukt.');
	}
};
