import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { nsStations, nsVoorzieningen, stationVoorPlek } from '$lib/server/ns';
import { mockStation } from '$lib/server/mock';
import { foutAntwoord, getal } from '$lib/server/antwoord';
import type { StationInfo } from '$lib/types';
import type { RequestHandler } from './$types';

/**
 * Informatie over een NS-station: sporen, soort station, reisassistentie en voorzieningen.
 * Parameters: code, of naam (+ lat en lon om het juiste station te vinden)
 */
export const GET: RequestHandler = async ({ url }) => {
	const p = url.searchParams;
	const code = p.get('code')?.toUpperCase() || undefined;
	const naam = p.get('naam') || undefined;
	const lat = getal(p.get('lat'));
	const lon = getal(p.get('lon'));
	if (!code && !naam && (lat === undefined || lon === undefined)) return json({ fout: 'Geef een station op.' }, { status: 400 });
	const c = config();
	if (c.mock) return json(mockStation(naam ?? code));
	if (!c.nsKey) return json({ fout: 'NS API-key is nog niet ingesteld.' }, { status: 503 });
	try {
		const stations = await nsStations(c.nsKey);
		const station = code
			? stations.find((s) => s.code === code)
			: stationVoorPlek(stations, { naam: naam ?? '', lat: lat ?? 0, lon: lon ?? 0, type: 'station' }, 400);
		if (!station) return json({ fout: 'Dit is geen NS-station.' }, { status: 404 });
		// Zonder voorzieningen is de pagina nog steeds bruikbaar
		const voorzieningen = await nsVoorzieningen(c.nsKey, station.code).catch(() => []);
		const antwoord: StationInfo = {
			code: station.code,
			naam: station.naam,
			lat: station.lat,
			lon: station.lon,
			land: station.land,
			type: station.type,
			sporen: station.sporen ?? [],
			reisassistentie: station.reisassistentie,
			voorzieningen,
			bron: ['NS Reisinformatie API', ...(voorzieningen.length ? ['NS Places API'] : [])],
			opgehaaldOp: new Date().toISOString()
		};
		return json(antwoord, { headers: { 'cache-control': 'private, max-age=300' } });
	} catch (e) {
		return foutAntwoord(e, 'Stationsinformatie ophalen mislukt.');
	}
};
