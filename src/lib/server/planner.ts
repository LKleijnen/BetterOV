// Planner: Transitous met NS-fallback na 4 s, plus drukte- en prijsverrijking.
// Adviezen staan op vertrektijd; de app zet er labels op (snelst, goedkoopst, …). Hebben alle
// adviezen een overstap, dan zoeken we er een reis met minder overstappen bij.

import type { Advies, Leg, PlanAntwoord, Plek, Voorkeur } from '../types';
import { herbereken } from '../reis';
import { ApiFout } from './http';
import { motisPlan } from './motis';
import { nsPlan, nsRit, nsStations, ritHalteBij } from './ns';
import { berekenPrijs } from './prijs';
import { pastBij, type Reisopties } from '../reisopties';

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
	opties?: Reisopties;
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

/** Op vertrektijd, zoals in de NS-app */
export function opVertrek(adviezen: Advies[]): Advies[] {
	return [...adviezen].sort((a, b) => Date.parse(a.vertrek.verwacht) - Date.parse(b.vertrek.verwacht) || a.duur - b.duur);
}

export function foutTekst(e: unknown): string {
	if (e instanceof ApiFout) {
		if (e.status === 0) return e.message;
		return `HTTP ${e.status}`;
	}
	return (e as Error)?.message ?? 'onbekende fout';
}

export async function plan(v: PlanVraag, d: Diensten): Promise<PlanAntwoord> {
	// Vangnet: wat de planner niet zelf kan uitsluiten (zoals treinen met reservering) filteren we hier
	const filter = (lijst: Advies[]) => (v.opties ? lijst.filter((a) => pastBij(a, v.opties!)) : lijst);
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
					opties: v.opties
				},
				TRANSITOUS_TIMEOUT_MS
			);
			resultaat.adviezen = filter(resultaat.adviezen);
			// Minstens 3 opties tonen
			if (resultaat.adviezen.length < 3 && !v.cursor) {
				const cursor = v.aankomst ? resultaat.vorige : resultaat.volgende;
				if (cursor) {
					const meer = await motisPlan(
						{ van: v.van, naar: v.naar, via: v.via, cursor, aantal: 6, opties: v.opties },
						TRANSITOUS_TIMEOUT_MS
					).catch(() => undefined);
					if (meer) {
						resultaat.adviezen = uniek([...resultaat.adviezen, ...filter(meer.adviezen)]);
						if (v.aankomst) resultaat.vorige = meer.vorige;
						else resultaat.volgende = meer.volgende;
					}
				}
			}
			// Alles met overstap? Zoek er een reis met minder overstappen bij (hooguit 2,5 s extra)
			const minsteOverstappen = Math.min(...resultaat.adviezen.map((a) => a.overstappen));
			if (!v.cursor && resultaat.adviezen.length > 0 && minsteOverstappen >= 1) {
				const minder = await metBudget(
					2500,
					motisPlan(
						{ van: v.van, naar: v.naar, via: v.via, tijd: v.tijd, aankomst: v.aankomst, aantal: 2, venster: 7200, maxOverstappen: minsteOverstappen - 1, opties: v.opties },
						2500
					)
				);
				if (minder) resultaat.adviezen = uniek([...resultaat.adviezen, ...filter(minder.adviezen)]);
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
			context: v.bron === 'ns' ? v.cursor : undefined,
			opties: v.opties
		});
		resultaat.adviezen = filter(resultaat.adviezen);
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
		adviezen: opVertrek(herberekend),
		bron,
		melding,
		vorige: resultaat.vorige,
		volgende: resultaat.volgende,
		drukteBeschikbaar: herberekend.some((a) => a.legs.some((l) => l.isNS && l.drukte && l.drukte !== 'onbekend')),
		opgehaaldOp: new Date().toISOString()
	};
}
