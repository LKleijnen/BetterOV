// Hoe ver je bent tijdens een rit: tussen welke twee haltes, en hoe ver daartussen (op tijd).

import type { Leg } from './types';
import { ms } from './tijd';

export interface StopTijd {
	/** Aankomst in ms (bij de eerste halte gelijk aan vertrek) */
	aankomst: number;
	/** Vertrek in ms (bij de laatste halte gelijk aan aankomst) */
	vertrek: number;
}

/** Tijden van de haltes van een rit: vertrek, de tussenstops (optioneel) en aankomst */
export function stopTijden(leg: Leg, metTussenstops: boolean): StopTijd[] {
	const vertrek = ms(leg.vertrek.verwacht);
	const aankomst = ms(leg.aankomst.verwacht);
	const tussen = metTussenstops
		? leg.tussenstops.map((t) => {
				const a = ms((t.aankomst ?? t.vertrek)?.verwacht ?? '');
				const v = ms((t.vertrek ?? t.aankomst)?.verwacht ?? '');
				return { aankomst: a, vertrek: Math.max(a, v) };
			})
		: [];
	// Haltes zonder tijd overslaan zou de punten op de lijn verschuiven; geef ze de tijd van de vorige
	const lijst = [{ aankomst: vertrek, vertrek }, ...tussen, { aankomst, vertrek: aankomst }];
	for (let k = 1; k < lijst.length; k++) {
		if (!Number.isFinite(lijst[k].aankomst)) lijst[k].aankomst = lijst[k - 1].vertrek;
		if (!Number.isFinite(lijst[k].vertrek)) lijst[k].vertrek = lijst[k].aankomst;
	}
	return lijst;
}

/**
 * Waar je nu bent: index van de laatste halte waar je langs bent en de fractie (0–1) van de weg
 * naar de volgende. Null vóór vertrek en na aankomst.
 */
export function ritVoortgang(stops: StopTijd[], nu: number): { index: number; fractie: number } | null {
	if (stops.length < 2 || !Number.isFinite(stops[0].vertrek)) return null;
	if (nu < stops[0].vertrek || nu >= stops[stops.length - 1].aankomst) return null;
	for (let k = 1; k < stops.length; k++) {
		const vorige = stops[k - 1];
		const deze = stops[k];
		if (nu < deze.aankomst) {
			const duur = deze.aankomst - vorige.vertrek;
			const fractie = duur > 0 ? (nu - vorige.vertrek) / duur : 1;
			return { index: k - 1, fractie: Math.min(1, Math.max(0, fractie)) };
		}
		// Staat stil bij deze halte
		if (nu < deze.vertrek) return { index: k, fractie: 0 };
	}
	return null;
}

/** Ben je al langs deze tijd? (voor het doorstrepen van haltes) */
export function voorbij(tijd: { verwacht: string } | undefined, nu: number): boolean {
	return !!tijd && ms(tijd.verwacht) < nu;
}

/**
 * Plek van elke halte op de lijn (0 = vertrek, 1 = aankomst), op tijd verdeeld. Een tussenstop staat
 * in het midden van zijn stilstand. Altijd oplopend, ook als de tijden van de vervoerder dat niet zijn.
 */
export function stopPosities(stops: StopTijd[]): number[] {
	const n = stops.length;
	if (n < 2) return stops.map(() => 0);
	const begin = stops[0].vertrek;
	const duur = stops[n - 1].aankomst - begin;
	let vorige = 0;
	return stops.map((s, k) => {
		if (k === 0) return 0;
		if (k === n - 1) return 1;
		const p = duur > 0 && Number.isFinite(duur) ? ((s.aankomst + s.vertrek) / 2 - begin) / duur : k / (n - 1);
		vorige = Math.min(1, Math.max(vorige, p));
		return vorige;
	});
}

/**
 * Pixels vanaf het vertrekpunt bij uitgeklapte tussenstops: op tijd verdeeld over `lengte`, maar met
 * minstens `minAfstand` tussen twee haltes (zodat de namen leesbaar blijven). De eerste tussenstop
 * staat minstens `eersteVanaf` na het vertrek en de laatste minstens `laatsteAfstand` voor de aankomst
 * (zodat de namen niet tegen die van het vertrek- en aankomststation aan staan).
 */
export function spreidPosities(posities: number[], lengte: number, minAfstand: number, eersteVanaf = 0, laatsteAfstand = minAfstand): number[] {
	const uit: number[] = [];
	posities.forEach((p, k) => {
		if (k === 0) return uit.push(0);
		const laatste = k === posities.length - 1;
		let y = Math.max((laatste ? 1 : p) * lengte, uit[k - 1] + (laatste && k > 1 ? laatsteAfstand : minAfstand));
		if (k === 1 && !laatste) y = Math.max(y, eersteVanaf);
		uit.push(y);
	});
	return uit;
}

/** Waar het bolletje staat (in dezelfde eenheid als `posities`), gegeven de voortgang uit ritVoortgang */
export function plekOpLijn(posities: number[], voortgang: { index: number; fractie: number }): number {
	const van = posities[voortgang.index] ?? 0;
	const naar = posities[Math.min(voortgang.index + 1, posities.length - 1)] ?? van;
	return van + (naar - van) * voortgang.fractie;
}
