// Hulpjes om testreizen op te bouwen (alleen voor unit-tests).

import type { Advies, Leg } from './types';
import { adviesId, herbereken } from './reis';

export function t(hhmm: string, dag = '2026-09-25'): string {
	return `${dag}T${hhmm}:00+02:00`;
}

export function ovLeg(
	van: string,
	naar: string,
	vertrek: string,
	aankomst: string,
	extra: Partial<Leg> & { vertrekVerwacht?: string; aankomstVerwacht?: string } = {}
): Leg {
	const { vertrekVerwacht, aankomstVerwacht, ...rest } = extra;
	const v = { gepland: t(vertrek), verwacht: t(vertrekVerwacht ?? vertrek) };
	const a = { gepland: t(aankomst), verwacht: t(aankomstVerwacht ?? aankomst) };
	return {
		modus: 'trein',
		van: { naam: van, lat: 52, lon: 5, stopId: `stop-${van}`, vertrek: v, spoor: '5', geplandSpoor: '5' },
		naar: { naam: naar, lat: 52.1, lon: 5.1, stopId: `stop-${naar}`, aankomst: a, spoor: '7', geplandSpoor: '7' },
		vertrek: v,
		aankomst: a,
		duur: (Date.parse(a.verwacht) - Date.parse(v.verwacht)) / 1000,
		tussenstops: [],
		productNaam: 'Intercity',
		lijn: 'IC',
		richting: naar,
		ritnummer: '3000',
		tripId: `trip-${van}-${naar}`,
		realtime: true,
		uitgevallen: false,
		isNS: true,
		meldingen: [],
		...rest
	};
}

export function loopLeg(van: string, naar: string, start: string, minuten: number): Leg {
	const s = t(start);
	const e = new Date(Date.parse(s) + minuten * 60000).toISOString();
	return {
		modus: 'lopen',
		van: { naam: van, lat: 52, lon: 5 },
		naar: { naam: naar, lat: 52, lon: 5 },
		vertrek: { gepland: s, verwacht: s },
		aankomst: { gepland: e, verwacht: e },
		duur: minuten * 60,
		tussenstops: [],
		realtime: false,
		uitgevallen: false,
		isNS: false,
		meldingen: []
	};
}

export function maakAdvies(legs: Leg[]): Advies {
	return herbereken({
		id: adviesId(legs),
		bron: 'transitous',
		vertrek: legs[0].vertrek,
		aankomst: legs[legs.length - 1].aankomst,
		duur: 0,
		overstappen: 0,
		legs
	});
}
