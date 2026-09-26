// Reislogica die op client, server en in de cron-worker hetzelfde moet werken:
// overstapmarges, problemen in een actieve reis en de huidige stap.

import type { Advies, Drukte, Leg, Probleem } from './types';
import { klok, ms, vertragingMinuten } from './tijd';

export const KRAPPE_OVERSTAP_MIN = 3;
/** Vertraging op de eindaankomst vanaf wanneer we een melding geven */
export const VERTRAGING_MELDEN_MIN = 5;

export function isOV(leg: Leg): boolean {
	return leg.modus !== 'lopen' && leg.modus !== 'fiets' && leg.modus !== 'auto';
}

export interface Overstap {
	/** Index van de aankomende OV-leg */
	vanLeg: number;
	/** Index van de vertrekkende OV-leg */
	naarLeg: number;
	halte: string;
	/** Minuten tussen aankomst en vertrek */
	overstaptijd: number;
	/** Minuten lopen tussen de twee OV-legs */
	looptijd: number;
	/** Overstaptijd min looptijd */
	marge: number;
	haalbaar: boolean;
	krap: boolean;
	spoorVan?: string;
	spoorNaar?: string;
}

export function overstappen(advies: Pick<Advies, 'legs'>): Overstap[] {
	const resultaat: Overstap[] = [];
	const legs = advies.legs;
	let vorige = -1;
	for (let i = 0; i < legs.length; i++) {
		if (!isOV(legs[i])) continue;
		if (vorige >= 0) {
			const a = legs[vorige];
			const b = legs[i];
			let looptijdSec = 0;
			for (let j = vorige + 1; j < i; j++) looptijdSec += legs[j].duur;
			const overstaptijd = Math.floor((ms(b.vertrek.verwacht) - ms(a.aankomst.verwacht)) / 60000);
			const looptijd = Math.ceil(looptijdSec / 60);
			const marge = overstaptijd - looptijd;
			const uitgevallen = a.uitgevallen || b.uitgevallen || !!b.van.uitgevallen || !!a.naar.uitgevallen;
			resultaat.push({
				vanLeg: vorige,
				naarLeg: i,
				halte: a.naar.naam === b.van.naam ? a.naar.naam : `${a.naar.naam} → ${b.van.naam}`,
				overstaptijd,
				looptijd,
				marge,
				haalbaar: marge >= 0 && !uitgevallen,
				krap: marge < KRAPPE_OVERSTAP_MIN,
				spoorVan: a.naar.spoor,
				spoorNaar: b.van.spoor
			});
		}
		vorige = i;
	}
	return resultaat;
}

export function ovLegs(advies: Pick<Advies, 'legs'>): Leg[] {
	return advies.legs.filter(isOV);
}

export function spoorGewijzigd(h: { spoor?: string; geplandSpoor?: string }): boolean {
	return !!h.spoor && !!h.geplandSpoor && h.spoor !== h.geplandSpoor;
}

export type AdviesStatus = 'optijd' | 'vertraagd' | 'krap' | 'uitgevallen' | 'onhaalbaar';

export function adviesStatus(advies: Advies): AdviesStatus {
	const ov = ovLegs(advies);
	if (ov.some((l) => l.uitgevallen || l.van.uitgevallen || l.naar.uitgevallen)) return 'uitgevallen';
	const o = overstappen(advies);
	if (o.some((x) => !x.haalbaar)) return 'onhaalbaar';
	if (o.some((x) => x.krap)) return 'krap';
	const vertraagd = ov.some(
		(l) => vertragingMinuten(l.vertrek) >= 1 || vertragingMinuten(l.aankomst) >= 1
	);
	return vertraagd ? 'vertraagd' : 'optijd';
}

/** Problemen in een (actieve) reis die nog niet voorbij zijn */
export function vindProblemen(advies: Advies, nu = Date.now()): Probleem[] {
	const problemen: Probleem[] = [];
	const legs = advies.legs;

	legs.forEach((leg, i) => {
		if (!isOV(leg)) return;
		if (ms(leg.aankomst.verwacht) < nu - 60000) return;
		const id = leg.ritnummer || leg.tripId || `${i}`;
		const naam = legNaam(leg);
		if (leg.uitgevallen || leg.van.uitgevallen) {
			problemen.push({
				soort: 'uitval',
				legIndex: i,
				tekst: `${naam} van ${klok(leg.vertrek.gepland)} uit ${leg.van.naam} rijdt niet.`,
				sleutel: `uitval:${i}:${id}`,
				ernstig: true
			});
			return;
		}
		if (leg.naar.uitgevallen) {
			problemen.push({
				soort: 'uitval',
				legIndex: i,
				tekst: `${naam} stopt niet in ${leg.naar.naam}.`,
				sleutel: `uitval-naar:${i}:${id}`,
				ernstig: true
			});
			return;
		}
		if (ms(leg.vertrek.verwacht) > nu && spoorGewijzigd(leg.van)) {
			problemen.push({
				soort: 'spoor',
				legIndex: i,
				tekst: `Spoorwijziging: ${naam} naar ${leg.richting ?? leg.naar.naam} vertrekt van spoor ${leg.van.spoor} (was ${leg.van.geplandSpoor}).`,
				sleutel: `spoor:${i}:${leg.van.spoor}`,
				ernstig: false
			});
		}
	});

	for (const o of overstappen(advies)) {
		const naar = legs[o.naarLeg];
		if (ms(naar.vertrek.verwacht) < nu) continue;
		if (naar.uitgevallen || naar.van.uitgevallen) continue; // al gemeld als uitval
		if (!o.haalbaar) {
			problemen.push({
				soort: 'overstap',
				legIndex: o.naarLeg,
				tekst: `Overstap in ${o.halte} is niet meer haalbaar (${o.marge} min).`,
				sleutel: `overstap:${o.naarLeg}:${naar.tripId ?? naar.ritnummer ?? ''}`,
				ernstig: true
			});
		} else if (o.krap) {
			problemen.push({
				soort: 'krap',
				legIndex: o.naarLeg,
				tekst: `Krappe overstap in ${o.halte}: ${o.marge} min.`,
				sleutel: `krap:${o.naarLeg}:${naar.tripId ?? naar.ritnummer ?? ''}`,
				ernstig: false
			});
		}
	}

	const laatste = [...legs].reverse().find(isOV);
	if (laatste) {
		const vertraging = vertragingMinuten(laatste.aankomst);
		if (vertraging >= VERTRAGING_MELDEN_MIN && ms(laatste.aankomst.verwacht) > nu) {
			const stap = Math.floor(vertraging / 5) * 5;
			problemen.push({
				soort: 'vertraging',
				legIndex: legs.indexOf(laatste),
				tekst: `Je komt ${vertraging} min later aan: ${klok(laatste.aankomst.verwacht)} in ${laatste.naar.naam}.`,
				sleutel: `vertraging:${stap}`,
				ernstig: false
			});
		}
	}
	return problemen;
}

export function legNaam(leg: Leg): string {
	if (leg.modus === 'lopen') return 'Lopen';
	if (leg.modus === 'fiets') return 'Fietsen';
	const soort =
		leg.productNaam ??
		({ trein: 'Trein', bus: 'Bus', tram: 'Tram', metro: 'Metro', veer: 'Veerboot' } as Record<string, string>)[
			leg.modus
		] ??
		'Rit';
	if (leg.modus === 'trein' || !leg.lijn) return soort;
	return leg.lijn.toLowerCase().startsWith(soort.toLowerCase()) ? leg.lijn : `${soort} ${leg.lijn}`;
}

export interface Stap {
	legIndex: number;
	fase: 'voor' | 'tijdens' | 'klaar';
	/** Tijdstip waarnaar wordt afgeteld */
	doel: string;
	titel: string;
	detail: string;
}

/** De eerstvolgende stap van een reis op dit moment */
export function huidigeStap(advies: Advies, nu = Date.now()): Stap {
	const legs = advies.legs;
	for (let i = 0; i < legs.length; i++) {
		const leg = legs[i];
		const vertrek = ms(leg.vertrek.verwacht);
		const aankomst = ms(leg.aankomst.verwacht);
		if (nu < vertrek) {
			if (isOV(leg)) {
				const spoor = leg.van.spoor ? `, spoor ${leg.van.spoor}` : '';
				return {
					legIndex: i,
					fase: 'voor',
					doel: leg.vertrek.verwacht,
					titel: `Instappen: ${legNaam(leg)} naar ${leg.richting ?? leg.naar.naam}`,
					detail: `${klok(leg.vertrek.verwacht)} vanaf ${leg.van.naam}${spoor}`
				};
			}
			return {
				legIndex: i,
				fase: 'voor',
				doel: leg.vertrek.verwacht,
				titel: `Vertrek lopend naar ${leg.naar.naam}`,
				detail: `Om ${klok(leg.vertrek.verwacht)}, ${Math.max(1, Math.round(leg.duur / 60))} min lopen`
			};
		}
		if (nu < aankomst) {
			if (isOV(leg)) {
				const spoor = leg.naar.spoor ? `, spoor ${leg.naar.spoor}` : '';
				return {
					legIndex: i,
					fase: 'tijdens',
					doel: leg.aankomst.verwacht,
					titel: `Uitstappen in ${leg.naar.naam}`,
					detail: `Aankomst ${klok(leg.aankomst.verwacht)}${spoor}`
				};
			}
			return {
				legIndex: i,
				fase: 'tijdens',
				doel: leg.aankomst.verwacht,
				titel: `Lopen naar ${leg.naar.naam}`,
				detail: `Aankomst ${klok(leg.aankomst.verwacht)}`
			};
		}
	}
	const laatste = legs[legs.length - 1];
	return {
		legIndex: legs.length - 1,
		fase: 'klaar',
		doel: laatste?.aankomst.verwacht ?? new Date(nu).toISOString(),
		titel: 'Je bent aangekomen',
		detail: laatste ? `${laatste.naar.naam}, ${klok(laatste.aankomst.verwacht)}` : ''
	};
}

const drukteVolgorde: Record<Drukte, number> = { laag: 1, gemiddeld: 2, hoog: 3, onbekend: 0 };

export function hoogsteDrukte(waarden: (Drukte | undefined)[]): Drukte | undefined {
	let beste: Drukte | undefined;
	for (const w of waarden) {
		if (!w || w === 'onbekend') continue;
		if (!beste || drukteVolgorde[w] > drukteVolgorde[beste]) beste = w;
	}
	return beste;
}

export function drukteScore(d: Drukte | undefined): number {
	return d ? drukteVolgorde[d] || 2.5 : 2.5;
}

/** Stabiele ID voor een advies op basis van ritten en geplande tijden */
export function adviesId(legs: Leg[]): string {
	const sleutel = legs
		.map((l) => `${l.modus}|${l.tripId ?? l.ritnummer ?? ''}|${l.van.naam}|${l.vertrek.gepland}|${l.naar.naam}`)
		.join(';');
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < sleutel.length; i++) {
		const c = sleutel.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 16777619);
		h2 = Math.imul(h2 ^ c, 2246822519);
	}
	return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/** Vult vertrek, aankomst, duur en overstappen van een advies opnieuw in vanuit de legs */
export function herbereken(advies: Advies): Advies {
	const legs = advies.legs;
	if (legs.length === 0) return advies;
	const vertrek = legs[0].vertrek;
	const aankomst = legs[legs.length - 1].aankomst;
	return {
		...advies,
		vertrek,
		aankomst,
		duur: Math.round((ms(aankomst.verwacht) - ms(vertrek.verwacht)) / 1000),
		overstappen: Math.max(0, ovLegs(advies).length - 1),
		drukte: hoogsteDrukte(legs.filter((l) => l.isNS).map((l) => l.drukte))
	};
}
