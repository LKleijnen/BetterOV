// Planner: Transitous met NS-fallback na 4 s, plus drukte- en prijsverrijking en sortering op voorkeur.

import type { Advies, Leg, PlanAntwoord, Plek, Voorkeur } from '../types';
import { drukteScore, herbereken } from '../reis';
import { ApiFout } from './http';
import { motisPlan } from './motis';
import { nsPlan, nsRit, nsStations, ritHalteBij } from './ns';
import { berekenPrijs } from './prijs';

export const TRANSITOUS_TIMEOUT_MS = 4000;

export interface PlanVraag {
	van: Plek;
	naar: Plek;
	via?: Plek;
	tijd?: string;
	aankomst?: boolean;
	voorkeur: Voorkeur;
	cursor?: string;
	/** Bij doorbladeren: bij de bron blijven van de eerste zoekvraag */
	bron?: 'transitous' | 'ns';
}

export interface Diensten {
	nsKey?: string;
}

function uniek(adviezen: Advies[]): Advies[] {
	const gezien = new Set<string>();
	return adviezen.filter((a) => (gezien.has(a.id) ? false : (gezien.add(a.id), true)));
}

async function metBudget<T>(ms: number, werk: Promise<T>): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const klaar = await Promise.race([
		werk.then((w) => ({ w })).catch(() => undefined),
		new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)))
	]);
	clearTimeout(timer);
	return klaar?.w;
}

/** Drukteverwachting invullen voor NS-treinen die nog geen drukte hebben */
export async function verrijkDrukte(adviezen: Advies[], nsKey: string | undefined): Promise<void> {
	if (!nsKey) return;
	const legs: Leg[] = adviezen.flatMap((a) => a.legs.filter((l) => l.isNS && l.ritnummer && !l.drukte));
	const perRit = new Map<string, Leg[]>();
	for (const l of legs) {
		const k = `${l.ritnummer}|${l.vertrek.gepland.slice(0, 10)}`;
		perRit.set(k, [...(perRit.get(k) ?? []), l]);
	}
	await Promise.all(
		[...perRit.values()].slice(0, 12).map(async (groep) => {
			const eerste = groep[0];
			const haltes = await nsRit(nsKey, eerste.ritnummer!, eerste.vertrek.gepland).catch(() => []);
			for (const l of groep) {
				const h = ritHalteBij(haltes, { naam: l.van.naam, lat: l.van.lat, lon: l.van.lon });
				if (h?.drukte) l.drukte = h.drukte;
			}
		})
	);
}

export async function verrijkPrijzen(adviezen: Advies[], nsKey: string | undefined): Promise<void> {
	const stations = await nsStations(nsKey).catch(() => []);
	await Promise.all(
		adviezen.map(async (a) => {
			const p = await berekenPrijs(a, nsKey, stations).catch(() => undefined);
			if (p) a.prijs = p;
		})
	);
}

export function sorteer(adviezen: Advies[], voorkeur: Voorkeur): Advies[] {
	const lijst = [...adviezen];
	const opVertrek = (a: Advies, b: Advies) => Date.parse(a.vertrek.verwacht) - Date.parse(b.vertrek.verwacht);
	const opDuur = (a: Advies, b: Advies) => a.duur - b.duur || opVertrek(a, b);
	switch (voorkeur) {
		case 'snelst':
			return lijst.sort(opDuur);
		case 'overstappen':
			return lijst.sort((a, b) => a.overstappen - b.overstappen || opDuur(a, b));
		case 'goedkoopst':
			return lijst.sort(
				(a, b) => (a.prijs?.bedrag ?? Infinity) - (b.prijs?.bedrag ?? Infinity) || opDuur(a, b)
			);
		case 'drukte':
			return lijst.sort((a, b) => drukteScore(a.drukte) - drukteScore(b.drukte) || opDuur(a, b));
	}
}

export function foutTekst(e: unknown): string {
	if (e instanceof ApiFout) {
		if (e.status === 0) return e.message;
		return `HTTP ${e.status}`;
	}
	return (e as Error)?.message ?? 'onbekende fout';
}

export async function plan(v: PlanVraag, d: Diensten): Promise<PlanAntwoord> {
	let resultaat: { adviezen: Advies[]; vorige?: string; volgende?: string } | undefined;
	let bron: 'transitous' | 'ns' = 'transitous';
	let melding: string | undefined;

	if (v.bron !== 'ns') {
		try {
			resultaat = await motisPlan(
				{
					van: v.van,
					naar: v.naar,
					via: v.via,
					tijd: v.tijd,
					aankomst: v.aankomst,
					cursor: v.cursor,
					aantal: 6,
					venster: v.voorkeur === 'overstappen' ? 5400 : undefined
				},
				TRANSITOUS_TIMEOUT_MS
			);
			// Minstens 3 opties tonen
			if (resultaat.adviezen.length < 3 && !v.cursor) {
				const cursor = v.aankomst ? resultaat.vorige : resultaat.volgende;
				if (cursor) {
					const meer = await motisPlan(
						{ van: v.van, naar: v.naar, via: v.via, cursor, aantal: 6 },
						TRANSITOUS_TIMEOUT_MS
					).catch(() => undefined);
					if (meer) {
						resultaat.adviezen = uniek([...resultaat.adviezen, ...meer.adviezen]);
						if (v.aankomst) resultaat.vorige = meer.vorige;
						else resultaat.volgende = meer.volgende;
					}
				}
			}
		} catch (e) {
			const timeout = e instanceof ApiFout && e.status === 0 && /binnen/.test(e.message);
			melding = timeout
				? 'Transitous reageerde niet binnen 4 seconden. Dit advies komt van de NS-planner.'
				: `Transitous gaf een fout (${foutTekst(e)}). Dit advies komt van de NS-planner.`;
			resultaat = undefined;
		}
	}

	if (!resultaat) {
		if (!d.nsKey) {
			throw new ApiFout(
				melding
					? 'Transitous reageert niet en de NS-fallback is nog niet ingesteld (NS_API_KEY ontbreekt).'
					: 'NS-planner is niet ingesteld.',
				503,
				'plan'
			);
		}
		resultaat = await nsPlan(d.nsKey, {
			van: v.van,
			naar: v.naar,
			via: v.via,
			tijd: v.tijd,
			aankomst: v.aankomst,
			context: v.bron === 'ns' ? v.cursor : undefined
		});
		bron = 'ns';
	}

	const adviezen = resultaat.adviezen;
	// Verrijking mag de planner niet ophouden: maximaal 2,5 s extra
	await metBudget(
		2500,
		Promise.all([verrijkDrukte(adviezen, d.nsKey), verrijkPrijzen(adviezen, d.nsKey)])
	);
	const herberekend = adviezen.map(herbereken);

	return {
		adviezen: sorteer(herberekend, v.voorkeur),
		bron,
		melding,
		vorige: resultaat.vorige,
		volgende: resultaat.volgende,
		drukteBeschikbaar: herberekend.some((a) => a.legs.some((l) => l.isNS && l.drukte && l.drukte !== 'onbekend')),
		opgehaaldOp: new Date().toISOString()
	};
}
