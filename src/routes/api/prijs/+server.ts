import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { berekenPrijs } from '$lib/server/prijs';
import { nsPrijs, nsStations } from '$lib/server/ns';
import { foutAntwoord } from '$lib/server/antwoord';
import type { Advies } from '$lib/types';
import type { RequestHandler } from './$types';

/** NS-prijs tussen twee stations: ?van=UT&naar=ASD */
export const GET: RequestHandler = async ({ url }) => {
	const van = url.searchParams.get('van')?.toUpperCase();
	const naar = url.searchParams.get('naar')?.toUpperCase();
	if (!van || !naar) return json({ fout: 'van en naar (stationscodes) zijn verplicht' }, { status: 400 });
	const c = config();
	try {
		const bedrag = await nsPrijs(c.nsKey, van, naar);
		return json({ bedrag, exact: bedrag !== null });
	} catch (e) {
		return foutAntwoord(e, 'Prijs ophalen mislukt.');
	}
};

/** Prijs (exact of schatting) voor een heel reisadvies. Body: { advies } */
export const POST: RequestHandler = async ({ request }) => {
	let advies: Advies;
	try {
		({ advies } = (await request.json()) as { advies: Advies });
		if (!advies?.legs) throw new Error();
	} catch {
		return json({ fout: 'Ongeldig advies.' }, { status: 400 });
	}
	const c = config();
	if (c.mock && advies.prijs) return json(advies.prijs);
	const stations = await nsStations(c.nsKey).catch(() => []);
	const prijs = await berekenPrijs({ ...advies, prijs: undefined }, c.nsKey, stations);
	return json(prijs ?? null);
};
