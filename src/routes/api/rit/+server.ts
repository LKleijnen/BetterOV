import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { haalRit } from '$lib/server/rit';
import { foutAntwoord, getal } from '$lib/server/antwoord';
import { mockRit } from '$lib/server/mock';
import type { RequestHandler } from './$types';

/** Volledige rit: alle haltes met realtime tijden. Parameters: tripId en/of ritnummer (NS) */
export const GET: RequestHandler = async ({ url }) => {
	const tripId = url.searchParams.get('tripId') || undefined;
	const ritnummer = url.searchParams.get('ritnummer') || undefined;
	const datum = url.searchParams.get('datum') || undefined;
	const c = config();
	if (!tripId && !ritnummer) return json({ fout: 'tripId of ritnummer is verplicht' }, { status: 400 });
	if (c.mock) {
		// Nepdata: de app geeft de haltes van jouw deel mee, de rit wordt eromheen verzonnen
		const p = url.searchParams;
		const halte = (k: string) => ({ naam: p.get(`${k}Naam`) ?? k, lat: getal(p.get(`${k}Lat`)) ?? 52.09, lon: getal(p.get(`${k}Lon`)) ?? 5.11, tijd: p.get(`${k}Tijd`) ?? new Date().toISOString() });
		return json({ leg: mockRit({ ritnummer, tripId, van: halte('van'), naar: halte('naar') }), bron: 'mock', opgehaaldOp: new Date().toISOString() });
	}
	try {
		return json(await haalRit({ tripId, ritnummer, datum }, { nsKey: c.nsKey }));
	} catch (e) {
		return foutAntwoord(e, 'Rit ophalen mislukt.');
	}
};
