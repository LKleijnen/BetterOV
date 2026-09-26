// Laatste verbinding naar huis: de reis met het laatste vertrek dat vannacht nog aankomt.

import type { Advies, Plek } from '../types';
import { nlDatum, nlDatumTijd, nlOnderdelen } from '../tijd';
import { motisPlan } from './motis';
import { nsPlan } from './ns';

export interface LaatsteVerbinding {
	advies?: Advies;
	/** Minuten tussen nu en het moment dat je moet vertrekken */
	spelingMin?: number;
	melding?: string;
	bron?: 'transitous' | 'ns';
	opgehaaldOp: string;
}

/** Eindtijd van de "reisnacht": 03:30 vannacht (of vandaag als het al na middernacht is) */
export function nachtGrens(nu = new Date()): Date {
	const o = nlOnderdelen(nu);
	const vandaag = nlDatum(nu);
	if (o.uur < 3 || (o.uur === 3 && o.minuut < 30)) return nlDatumTijd(vandaag, '03:30');
	const morgen = nlDatum(new Date(nlDatumTijd(vandaag, '12:00').getTime() + 24 * 3600 * 1000));
	return nlDatumTijd(morgen, '03:30');
}

export function kiesLaatste(adviezen: Advies[], nu = Date.now()): Advies | undefined {
	return adviezen
		.filter((a) => Date.parse(a.vertrek.verwacht) > nu && a.legs.some((l) => l.modus !== 'lopen'))
		.sort((a, b) => Date.parse(b.vertrek.verwacht) - Date.parse(a.vertrek.verwacht))[0];
}

export async function laatsteVerbinding(van: Plek, naar: Plek, nsKey?: string): Promise<LaatsteVerbinding> {
	const nu = Date.now();
	const grens = nachtGrens(new Date(nu)).toISOString();
	let adviezen: Advies[] = [];
	let bron: 'transitous' | 'ns' = 'transitous';
	try {
		const r = await motisPlan({ van, naar, tijd: grens, aankomst: true, aantal: 4 }, 6000);
		adviezen = r.adviezen;
	} catch (e) {
		if (!nsKey) throw e;
		const r = await nsPlan(nsKey, { van, naar, tijd: grens, aankomst: true });
		adviezen = r.adviezen;
		bron = 'ns';
	}
	const advies = kiesLaatste(adviezen, nu);
	const opgehaaldOp = new Date().toISOString();
	if (!advies) {
		return {
			melding: 'Er gaat vannacht geen verbinding meer naar huis. Bekijk de eerste reis morgenochtend in de planner.',
			bron,
			opgehaaldOp
		};
	}
	return {
		advies,
		spelingMin: Math.floor((Date.parse(advies.vertrek.verwacht) - nu) / 60000),
		bron,
		opgehaaldOp
	};
}
