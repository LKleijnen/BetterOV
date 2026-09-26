import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { motisVertrektijden } from '$lib/server/motis';
import { nsStations, nsVertrektijden, stationVoorPlek } from '$lib/server/ns';
import { mockVertrektijden } from '$lib/server/mock';
import { foutAntwoord, getal } from '$lib/server/antwoord';
import type { VertrekAntwoord } from '$lib/types';
import type { RequestHandler } from './$types';

/**
 * Vertrekbord voor een halte of station.
 * Parameters: stopId, of lat+lon (haltes in de buurt), naam (voor NS-terugval), tijd, cursor
 */
export const GET: RequestHandler = async ({ url }) => {
	const p = url.searchParams;
	const stopId = p.get('stopId') || undefined;
	const lat = getal(p.get('lat'));
	const lon = getal(p.get('lon'));
	const naam = p.get('naam') || undefined;
	if (!stopId && (lat === undefined || lon === undefined)) {
		return json({ fout: 'Kies een halte of station.' }, { status: 400 });
	}
	const c = config();
	if (c.mock) return json(mockVertrektijden(naam));
	try {
		const r = await motisVertrektijden(
			{ stopId, lat, lon, straal: stopId ? undefined : 500, tijd: p.get('tijd') || undefined, cursor: p.get('cursor') || undefined },
			6000
		);
		const antwoord: VertrekAntwoord & { volgende?: string } = {
			halte: { ...r.halte, naam: stopId ? (naam ?? r.halte.naam) : r.halte.naam },
			vertrekken: r.vertrekken,
			bron: 'transitous',
			opgehaaldOp: new Date().toISOString(),
			volgende: r.volgende
		};
		return json(antwoord);
	} catch (e) {
		// Terugval naar het NS-vertrekbord als de halte een treinstation is
		if (c.nsKey && lat !== undefined && lon !== undefined) {
			try {
				const stations = await nsStations(c.nsKey);
				const station = stationVoorPlek(stations, { naam: naam ?? '', lat, lon, type: 'station' }, 500);
				if (station) {
					const vertrekken = await nsVertrektijden(c.nsKey, station.code);
					return json({
						halte: { naam: station.naam, lat: station.lat, lon: station.lon },
						vertrekken,
						bron: 'ns',
						melding: 'Transitous reageerde niet; alleen treinen van het NS-vertrekbord.',
						opgehaaldOp: new Date().toISOString()
					} satisfies VertrekAntwoord);
				}
			} catch {
				// valt door naar foutmelding
			}
		}
		return foutAntwoord(e, 'Vertrektijden ophalen mislukt.');
	}
};
