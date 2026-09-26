import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { motisRit } from '$lib/server/motis';
import { nsRit, type NsRitHalte } from '$lib/server/ns';
import { foutAntwoord } from '$lib/server/antwoord';
import type { Halte, Leg } from '$lib/types';
import type { RequestHandler } from './$types';

function naarHalte(h: NsRitHalte): Halte {
	return {
		naam: h.naam,
		lat: h.lat,
		lon: h.lon,
		aankomst: h.aankomst,
		vertrek: h.vertrek,
		spoor: h.spoor,
		geplandSpoor: h.geplandSpoor,
		uitgevallen: h.uitgevallen
	};
}

function nsLegVanRit(ritnummer: string, haltes: NsRitHalte[]): Leg | null {
	const stoppend = haltes.filter((h) => h.status !== 'PASSING');
	if (stoppend.length < 2) return null;
	const van = naarHalte(stoppend[0]);
	const naar = naarHalte(stoppend[stoppend.length - 1]);
	const vertrek = van.vertrek ?? van.aankomst!;
	const aankomst = naar.aankomst ?? naar.vertrek!;
	return {
		modus: 'trein',
		van,
		naar,
		vertrek,
		aankomst,
		duur: Math.round((Date.parse(aankomst.verwacht) - Date.parse(vertrek.verwacht)) / 1000),
		tussenstops: stoppend.slice(1, -1).map(naarHalte),
		richting: naar.naam,
		ritnummer,
		realtime: true,
		uitgevallen: stoppend.every((h) => h.uitgevallen),
		isNS: true,
		meldingen: [],
		drukte: stoppend[0].drukte
	};
}

/** Volledige rit: alle haltes met realtime tijden. Parameters: tripId en/of ritnummer (NS) */
export const GET: RequestHandler = async ({ url }) => {
	const tripId = url.searchParams.get('tripId') || undefined;
	const ritnummer = url.searchParams.get('ritnummer') || undefined;
	const datum = url.searchParams.get('datum') || undefined;
	const c = config();
	if (!tripId && !ritnummer) return json({ fout: 'tripId of ritnummer is verplicht' }, { status: 400 });
	let fout: unknown;
	if (tripId && !c.mock) {
		try {
			const leg = await motisRit(tripId);
			if (leg) return json({ leg, bron: 'transitous', opgehaaldOp: new Date().toISOString() });
		} catch (e) {
			fout = e;
		}
	}
	if (ritnummer && c.nsKey) {
		try {
			const leg = nsLegVanRit(ritnummer, await nsRit(c.nsKey, ritnummer, datum));
			if (leg) return json({ leg, bron: 'ns', opgehaaldOp: new Date().toISOString() });
		} catch (e) {
			fout = fout ?? e;
		}
	}
	if (fout) return foutAntwoord(fout, 'Rit ophalen mislukt.');
	return json({ fout: 'Rit niet gevonden.' }, { status: 404 });
};
