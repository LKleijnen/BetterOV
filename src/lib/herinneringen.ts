// Herinneringen tijdens een reis: een melding een paar minuten (of seconden) voordat je moet instappen
// of uitstappen. De cron-worker stuurt ze; hoe lang van tevoren stel je in bij Instellingen.
// Alleen relatieve imports: ook de cron-worker gebruikt dit bestand.

import type { Advies, Leg } from './types';
import { isOV, legNaam } from './reis';
import { klok, ms } from './tijd';

export interface HerinneringInstellingen {
	/** Seconden vóór vertrek, bijvoorbeeld [300, 60, 30] */
	instappen: number[];
	/** Seconden vóór aankomst */
	uitstappen: number[];
}

export const STANDAARD_HERINNERINGEN: HerinneringInstellingen = { instappen: [120], uitstappen: [120] };

/** Keuzes in de instellingen (seconden) */
export const HERINNERING_KEUZES = [30, 60, 120, 180, 300, 600, 900];

/** Instappen pas zoveel na aankomst van het voertuig waar je dan nog in zit */
export const NA_AANKOMST_MS = 60000;
/** Twee herinneringen voor hetzelfde moment die dichter dan dit op elkaar zitten: alleen de laatste */
const MIN_TUSSENRUIMTE_MS = 30000;

export interface Herinnering {
	soort: 'instappen' | 'uitstappen';
	legIndex: number;
	/** Uniek per rit en instelling, zodat hij maar één keer komt */
	sleutel: string;
	/** Wanneer de melding moet komen (ms) */
	moment: number;
	/** Vertrek (instappen) of aankomst (uitstappen) in ms */
	doel: number;
	titel: string;
	tekst: string;
}

/** "30 s", "1 min", "1,5 min", "10 min" */
export function duurKort(seconden: number): string {
	if (seconden < 60) return `${Math.max(0, Math.round(seconden))} s`;
	const min = Math.round((seconden / 60) * 2) / 2;
	return `${String(min).replace('.', ',')} min`;
}

/** Netjes maken: alleen geldige, unieke waarden, van groot naar klein */
export function schoneMomenten(lijst: unknown): number[] {
	if (!Array.isArray(lijst)) return [];
	return [...new Set(lijst.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 3600).map(Math.round))].sort((a, b) => b - a);
}

export function herinneringInstellingen(x: Partial<HerinneringInstellingen> | undefined | null): HerinneringInstellingen {
	if (!x) return STANDAARD_HERINNERINGEN;
	return { instappen: schoneMomenten(x.instappen), uitstappen: schoneMomenten(x.uitstappen) };
}

/**
 * Momenten per instelling, met een ondergrens (eerder kan het niet, bijvoorbeeld omdat je nog in een
 * ander voertuig zit). Een herinnering die door die ondergrens vlak voor of na de volgende valt, vervalt:
 * dan komt alleen de latere.
 */
function momenten(doel: number, seconden: number[], vanaf: number): { seconden: number; moment: number }[] {
	const lijst = [...seconden]
		.sort((a, b) => b - a)
		.map((s) => ({ seconden: s, moment: Math.max(doel - s * 1000, vanaf) }))
		.filter((m) => m.moment < doel);
	return lijst.filter((m, k) => k === lijst.length - 1 || lijst[k + 1].moment - m.moment >= MIN_TUSSENRUIMTE_MS);
}

function spoorTekst(spoor: string | undefined): string {
	return spoor ? `, spoor ${spoor}` : '';
}

function ritId(leg: Leg, i: number): string {
	return leg.tripId ?? leg.ritnummer ?? `${i}`;
}

/** Alle herinneringen van een reis (ook die al voorbij zijn); de cron-worker kiest welke nu moeten */
export function reisHerinneringen(advies: Advies, instellingen: HerinneringInstellingen): Herinnering[] {
	const uit: Herinnering[] = [];
	const legs = advies.legs;
	legs.forEach((leg, i) => {
		if (!isOV(leg) || leg.uitgevallen || leg.van.uitgevallen) return;
		const naam = legNaam(leg);
		const richting = leg.richting ?? leg.naar.naam;
		const vertrek = ms(leg.vertrek.verwacht);
		const aankomst = ms(leg.aankomst.verwacht);
		if (!Number.isFinite(vertrek) || !Number.isFinite(aankomst)) return;

		// Instappen: zit je nog in een ander voertuig, dan pas een minuut nadat dat is aangekomen
		const vorige = legs.slice(0, i).reverse().find(isOV);
		const vorigeAankomst = vorige ? ms(vorige.aankomst.verwacht) : NaN;
		const instapVanaf = Number.isFinite(vorigeAankomst) ? vorigeAankomst + NA_AANKOMST_MS : -Infinity;
		for (const m of momenten(vertrek, instellingen.instappen, instapVanaf)) {
			uit.push({
				soort: 'instappen',
				legIndex: i,
				sleutel: `instap:${i}:${m.seconden}:${ritId(leg, i)}`,
				moment: m.moment,
				doel: vertrek,
				titel: '', // Wordt bij het versturen ingevuld met de tijd die dan nog over is
				tekst: `${naam} richting ${richting} vertrekt om ${klok(leg.vertrek.verwacht)} uit ${leg.van.naam}${spoorTekst(leg.van.spoor)}.`
			});
		}

		// Uitstappen: alleen als je er al in zit, dus pas nadat hij bij jou vertrokken is
		if (leg.naar.uitgevallen) return;
		const volgende = legs.slice(i + 1).find(isOV);
		const daarna =
			volgende && !volgende.uitgevallen
				? ` Daarna: ${legNaam(volgende)} richting ${volgende.richting ?? volgende.naar.naam}, ${klok(volgende.vertrek.verwacht)}${spoorTekst(volgende.van.spoor)}.`
				: '';
		for (const m of momenten(aankomst, instellingen.uitstappen, vertrek)) {
			uit.push({
				soort: 'uitstappen',
				legIndex: i,
				sleutel: `uitstap:${i}:${m.seconden}:${ritId(leg, i)}`,
				moment: m.moment,
				doel: aankomst,
				titel: '',
				tekst: `Je stapt uit in ${leg.naar.naam}${spoorTekst(leg.naar.spoor)} (${klok(leg.aankomst.verwacht)}).${daarna}`
			});
		}
	});
	return uit;
}

/** Titel met de tijd die op het moment van versturen nog over is */
export function herinneringTitel(h: Herinnering, verstuurd: number): string {
	const over = (h.doel - verstuurd) / 1000;
	const wat = h.soort === 'instappen' ? 'Instappen' : 'Uitstappen';
	return over < 20 ? `Nu ${wat.toLowerCase()}` : `${wat} over ${duurKort(over)}`;
}

/**
 * Welke herinneringen de cron-worker nu moet versturen: alles wat tot de volgende controle (over een
 * minuut) aan de beurt is en nog niet gemeld is. Te laat (meer dan 90 s, of na het vertrek of de
 * aankomst zelf) sturen we niet meer.
 */
export function teVersturen(alle: Herinnering[], gemeld: Set<string>, nu: number, tot = nu + 60000): Herinnering[] {
	return alle.filter((h) => !gemeld.has(h.sleutel) && h.moment <= tot && h.moment > nu - 90000 && h.doel > Math.max(nu, h.moment));
}
