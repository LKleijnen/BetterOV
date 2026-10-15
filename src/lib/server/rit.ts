// De volledige rit van een trein, bus of tram: alle haltes met realtime tijden.
// Gebruikt door /api/rit (de kaart en het ritoverzicht) en door het MCP-gereedschap.

import type { Halte, Leg } from '../types';
import { ApiFout } from './http';
import { motisRit } from './motis';
import { nsRit, type NsRitHalte } from './ns';
import { ritPad } from './trein';

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

/** Maakt van de NS-ritdata één leg van begin- tot eindpunt */
export function nsLegVanRit(ritnummer: string, haltes: NsRitHalte[]): Leg | null {
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

export interface RitAntwoord {
	leg: Leg;
	bron: 'transitous' | 'ns';
	opgehaaldOp: string;
}

/**
 * Haalt een rit op: eerst bij Transitous (tripId), anders bij NS (ritnummer).
 * Gooit een ApiFout als de rit nergens te vinden is.
 */
export async function haalRit(
	v: { tripId?: string; ritnummer?: string; datum?: string },
	diensten: { nsKey?: string }
): Promise<RitAntwoord> {
	let fout: unknown;
	if (v.tripId) {
		try {
			const leg = await motisRit(v.tripId);
			if (leg) return { leg, bron: 'transitous', opgehaaldOp: new Date().toISOString() };
		} catch (e) {
			fout = e;
		}
	}
	if (v.ritnummer && diensten.nsKey) {
		try {
			// Splitst de trein, dan alleen de tak van dit ritnummer
			const leg = nsLegVanRit(v.ritnummer, ritPad(await nsRit(diensten.nsKey, v.ritnummer, v.datum), { ritnummer: v.ritnummer }));
			if (leg) return { leg, bron: 'ns', opgehaaldOp: new Date().toISOString() };
		} catch (e) {
			fout = fout ?? e;
		}
	}
	if (fout) throw fout;
	throw new ApiFout('Rit niet gevonden.', 404);
}
