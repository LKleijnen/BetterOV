// Reisopties zoals in de NS-app: extra overstaptijd, vervoermiddelen, treinen met reservering
// en toegankelijk reizen. Gedeeld door app en server (plannen, filteren en in de URL zetten).

import type { Advies, Leg, Modus } from './types';
import { isOV, overstappen } from './reis';

export type Vervoer = 'trein' | 'bus' | 'tram' | 'metro' | 'veer';

export const ALLE_VERVOER: Vervoer[] = ['trein', 'bus', 'tram', 'metro', 'veer'];

export const VERVOER_NAMEN: Record<Vervoer, string> = {
	trein: 'Trein',
	bus: 'Bus',
	tram: 'Tram',
	metro: 'Metro',
	veer: 'Veerboot'
};

export const EXTRA_OVERSTAPTIJDEN = [0, 5, 10, 15, 20];

export interface Reisopties {
	/** Minuten die er bij elke overstap minimaal over moeten blijven, bovenop het lopen */
	extraOverstaptijd: number;
	/** Toegestane vervoermiddelen (minstens één) */
	vervoer: Vervoer[];
	/** Treinen waarvoor je moet reserveren (Eurostar, nachttreinen) niet tonen */
	zonderReservering: boolean;
	/** Route zonder trappen (rolstoel, kinderwagen) */
	toegankelijk: boolean;
}

export const STANDAARD_REISOPTIES: Reisopties = {
	extraOverstaptijd: 0,
	vervoer: [...ALLE_VERVOER],
	zonderReservering: false,
	toegankelijk: false
};

export function alleVervoer(o: Reisopties): boolean {
	return ALLE_VERVOER.every((v) => o.vervoer.includes(v));
}

/** Aantal opties dat afwijkt van de standaard (voor het bolletje op de knop) */
export function aantalAfwijkend(o: Reisopties): number {
	return (o.extraOverstaptijd > 0 ? 1 : 0) + (alleVervoer(o) ? 0 : 1) + (o.zonderReservering ? 1 : 0) + (o.toegankelijk ? 1 : 0);
}

/** Korte omschrijving voor onder de zoekopdracht, bijvoorbeeld "+5 min overstap · zonder bus" */
export function optiesTekst(o: Reisopties): string {
	const delen: string[] = [];
	if (o.extraOverstaptijd > 0) delen.push(`+${o.extraOverstaptijd} min overstap`);
	if (!alleVervoer(o)) {
		const uit = ALLE_VERVOER.filter((v) => !o.vervoer.includes(v));
		delen.push(uit.length <= 2 ? `zonder ${uit.map((v) => VERVOER_NAMEN[v].toLowerCase()).join(' en ')}` : `alleen ${o.vervoer.map((v) => VERVOER_NAMEN[v].toLowerCase()).join(', ')}`);
	}
	if (o.zonderReservering) delen.push('zonder reservering');
	if (o.toegankelijk) delen.push('toegankelijk');
	return delen.join(' · ');
}

export function optiesNaarParams(o: Reisopties, p: URLSearchParams) {
	if (o.extraOverstaptijd > 0) p.set('extraOverstap', String(o.extraOverstaptijd));
	if (!alleVervoer(o)) p.set('vervoer', o.vervoer.join(','));
	if (o.zonderReservering) p.set('zonderReservering', '1');
	if (o.toegankelijk) p.set('toegankelijk', '1');
}

export function optiesUitParams(p: URLSearchParams): Reisopties {
	const extra = Number(p.get('extraOverstap') ?? 0);
	const vervoer = (p.get('vervoer') ?? '').split(',').filter((v): v is Vervoer => (ALLE_VERVOER as string[]).includes(v));
	return {
		extraOverstaptijd: Number.isFinite(extra) ? Math.max(0, Math.min(60, Math.round(extra))) : 0,
		vervoer: vervoer.length ? vervoer : [...ALLE_VERVOER],
		zonderReservering: p.get('zonderReservering') === '1',
		toegankelijk: p.get('toegankelijk') === '1'
	};
}

/** Vervoerswijzen voor MOTIS (transitModes); undefined = alles */
export function motisModi(o: Reisopties): string[] | undefined {
	if (alleVervoer(o)) return undefined;
	const modi: Record<Vervoer, string[]> = {
		trein: ['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_RAIL', 'SUBURBAN'],
		bus: ['BUS', 'COACH'],
		tram: ['TRAM'],
		metro: ['SUBWAY'],
		veer: ['FERRY']
	};
	return o.vervoer.flatMap((v) => modi[v]);
}

/** Vervoerswijzen die de NS-planner moet overslaan (disabledTransportModalities) */
export function nsUitgeschakeld(o: Reisopties): string[] {
	const ns: Partial<Record<Vervoer, string>> = { bus: 'BUS', tram: 'TRAM', metro: 'METRO', veer: 'FERRY' };
	return ALLE_VERVOER.filter((v) => !o.vervoer.includes(v) && ns[v]).map((v) => ns[v]!);
}

const RESERVERING = /eurostar|thalys|nightjet|euronight|european sleeper|\btgv\b|snälltåget|\bEST\b|\bNJ\b|\bEN\b/i;

/** Trein waarvoor reserveren verplicht is (internationale hogesnelheids- en nachttreinen) */
export function vereistReservering(leg: Leg): boolean {
	if (leg.modus !== 'trein') return false;
	return [leg.productNaam, leg.lijn, leg.vervoerder].some((x) => !!x && RESERVERING.test(x));
}

function vervoerVan(m: Modus): Vervoer | null {
	return m === 'trein' || m === 'bus' || m === 'tram' || m === 'metro' || m === 'veer' ? m : null;
}

/**
 * Past een advies bij de opties? Voor de NS-planner (die niet alles ondersteunt) en als vangnet
 * voor Transitous. Een krappe overstap telt pas als 'te krap' onder de gevraagde extra tijd.
 */
export function pastBij(a: Advies, o: Reisopties): boolean {
	const ritten = a.legs.filter(isOV);
	if (!alleVervoer(o)) {
		for (const l of ritten) {
			const v = vervoerVan(l.modus);
			if (v && !o.vervoer.includes(v)) return false;
		}
	}
	if (o.zonderReservering && ritten.some(vereistReservering)) return false;
	if (o.extraOverstaptijd > 0 && overstappen(a).some((x) => x.marge < o.extraOverstaptijd)) return false;
	return true;
}
