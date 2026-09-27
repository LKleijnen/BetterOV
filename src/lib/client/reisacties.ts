// Acties die op meerdere schermen voorkomen: vaste reis starten, laatste verbinding, alternatieven.

import type { Advies, Plek, Probleem, Reis, WeekItem } from '$lib/types';
import { plekNaarParams } from '$lib/plekparams';
import { optiesNaarParams } from '$lib/reisopties';
import { adviesId, herbereken, isOV } from '$lib/reis';
import { ms, nlDatum } from '$lib/tijd';
import { api } from './api';
import { data } from './data.svelte';
import { huidigePositie } from './gps';
import { planner } from './planner.svelte';

/** Plant een vaste reis voor vandaag en kiest het advies dat het best bij de tijd past */
export async function planVasteReis(w: WeekItem): Promise<Advies | null> {
	planner.zetReis(w.van, w.naar, w.via ?? null);
	planner.zetMoment(nlDatum(), w.tijd, w.soort === 'aankomst');
	await planner.zoek();
	const doel = ms(planner.tijdstip()!);
	const lijst = [...planner.adviezen];
	if (w.soort === 'aankomst') {
		return (
			lijst
				.filter((a) => ms(a.aankomst.verwacht) <= doel + 60000)
				.sort((a, b) => ms(b.vertrek.verwacht) - ms(a.vertrek.verwacht))[0] ?? lijst[0] ?? null
		);
	}
	return (
		lijst
			.filter((a) => ms(a.vertrek.verwacht) >= doel - 60000)
			.sort((a, b) => ms(a.vertrek.verwacht) - ms(b.vertrek.verwacht))[0] ?? lijst[0] ?? null
	);
}

export async function startVasteReis(w: WeekItem): Promise<Reis | null> {
	const advies = await planVasteReis(w);
	if (!advies) return null;
	return data.startReis(w.van, w.naar, advies);
}

export interface LaatsteAntwoord {
	advies?: Advies;
	spelingMin?: number;
	melding?: string;
	bron?: 'transitous' | 'ns';
	opgehaaldOp: string;
	van: Plek;
	naar: Plek;
}

export async function laatsteNaarHuis(): Promise<LaatsteAntwoord> {
	const thuis = data.profiel.thuislocatie;
	if (!thuis) throw new Error('Stel eerst je thuislocatie in bij Meer → Instellingen.');
	const pos = await huidigePositie();
	const van: Plek = { naam: 'Huidige locatie', lat: pos.lat, lon: pos.lon, type: 'gps' };
	const p = new URLSearchParams();
	plekNaarParams('van', van, p);
	plekNaarParams('naar', thuis, p);
	const r = await api<Omit<LaatsteAntwoord, 'van' | 'naar'>>(`/api/laatste-verbinding?${p}`, { timeoutMs: 20000 });
	return { ...r, van, naar: thuis };
}

/** Waar en wanneer een alternatief moet beginnen bij een probleem in de actieve reis */
export function vertrekpuntVoorAlternatief(reis: Reis, probleem: Probleem | null): { van: Plek; tijd: string; vanafLeg: number } {
	const legs = reis.advies.legs;
	const nu = Date.now();
	const index = probleem ? probleem.legIndex : legs.findIndex((l) => isOV(l) && ms(l.vertrek.verwacht) > nu);
	const i = index < 0 ? legs.length - 1 : index;
	let vorigeOV = -1;
	for (let j = i - 1; j >= 0; j--) {
		if (isOV(legs[j])) {
			vorigeOV = j;
			break;
		}
	}
	if (vorigeOV >= 0 && (!probleem || probleem.soort === 'overstap' || probleem.soort === 'krap' || ms(legs[vorigeOV].aankomst.verwacht) > nu)) {
		const h = legs[vorigeOV].naar;
		return {
			van: { naam: h.naam, lat: h.lat, lon: h.lon, stopId: h.stopId, type: 'halte' },
			tijd: new Date(Math.max(nu, ms(legs[vorigeOV].aankomst.verwacht))).toISOString(),
			vanafLeg: vorigeOV + 1
		};
	}
	const h = legs[i].van;
	// Looplegs vóór de getroffen rit blijven staan: het alternatief begint bij die halte
	return {
		van: { naam: h.naam, lat: h.lat, lon: h.lon, stopId: h.stopId, type: isOV(legs[i]) ? 'halte' : undefined },
		tijd: new Date(Math.max(nu, ms(legs[i].vertrek.gepland) - 60000)).toISOString(),
		vanafLeg: i
	};
}

export async function zoekAlternatieven(reis: Reis, probleem: Probleem | null): Promise<{ adviezen: Advies[]; vanafLeg: number; van: Plek; melding?: string }> {
	const { van, tijd, vanafLeg } = vertrekpuntVoorAlternatief(reis, probleem);
	const p = new URLSearchParams();
	plekNaarParams('van', van, p);
	plekNaarParams('naar', reis.naar, p);
	p.set('tijd', tijd);
	p.set('voorkeur', 'snelst');
	// Dezelfde reisopties als bij plannen (bijvoorbeeld extra overstaptijd)
	optiesNaarParams(planner.opties, p);
	const r = await api<{ adviezen: Advies[]; melding?: string }>(`/api/plan?${p}`, { timeoutMs: 20000 });
	// Het huidige (problematische) vervolg niet opnieuw aanbieden
	const huidigeTrips = new Set(reis.advies.legs.slice(vanafLeg).map((l) => l.tripId).filter(Boolean));
	const adviezen = r.adviezen
		.filter((a) => !a.legs.filter(isOV).every((l) => l.tripId && huidigeTrips.has(l.tripId)))
		.sort((a, b) => ms(a.aankomst.verwacht) - ms(b.aankomst.verwacht));
	return { adviezen, vanafLeg, van, melding: r.melding };
}

/** Vervangt het vervolg van de actieve reis door een gekozen alternatief */
export async function kiesAlternatief(reis: Reis, alternatief: Advies, vanafLeg: number) {
	const legs = [...reis.advies.legs.slice(0, vanafLeg), ...alternatief.legs];
	const advies = herbereken({ ...reis.advies, legs, id: adviesId(legs), bron: alternatief.bron });
	await data.werkReisBij(reis, advies, []);
}
