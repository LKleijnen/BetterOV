// Ververst een lopend reisadvies met realtime-informatie per rit.
// Wordt gebruikt door /api/reisstatus (app open) en door de cron-worker (app dicht).

import type { Advies, Halte, Leg } from '../types';
import { herbereken, isOV } from '../reis';
import { ms } from '../tijd';
import { motisRit } from './motis';
import { nsRit, ritHalteBij, type NsRitHalte } from './ns';

function zelfdeHalte(a: Halte, b: Halte): boolean {
	if (a.stopId && b.stopId && a.stopId === b.stopId) return true;
	return a.naam.trim().toLowerCase() === b.naam.trim().toLowerCase();
}

function vindIndex(haltes: Halte[], doel: Halte, geplandIso: string | undefined, vanaf = 0): number {
	let beste = -1;
	let besteVerschil = Infinity;
	const doelMs = ms(geplandIso);
	for (let i = vanaf; i < haltes.length; i++) {
		if (!zelfdeHalte(haltes[i], doel)) continue;
		const t = haltes[i].vertrek?.gepland ?? haltes[i].aankomst?.gepland;
		const verschil = Number.isNaN(doelMs) || !t ? 0 : Math.abs(ms(t) - doelMs);
		if (verschil < besteVerschil) {
			besteVerschil = verschil;
			beste = i;
		}
	}
	return beste;
}

/** Knipt uit een volledige rit het deel tussen in- en uitstaphalte van de oude leg */
export function snijLeg(oud: Leg, rit: Leg): Leg {
	const haltes: Halte[] = [rit.van, ...rit.tussenstops, rit.naar];
	const a = vindIndex(haltes, oud.van, oud.vertrek.gepland);
	if (a < 0) return { ...oud, uitgevallen: rit.uitgevallen || oud.uitgevallen };
	const b = vindIndex(haltes, oud.naar, oud.aankomst.gepland, a + 1);
	if (b < 0) return { ...oud, uitgevallen: rit.uitgevallen || oud.uitgevallen };
	const van = haltes[a];
	const naar = haltes[b];
	const vertrek = van.vertrek ?? oud.vertrek;
	const aankomst = naar.aankomst ?? oud.aankomst;
	return {
		...oud,
		van: { ...oud.van, ...van, naam: oud.van.naam || van.naam },
		naar: { ...oud.naar, ...naar, naam: oud.naar.naam || naar.naam },
		vertrek,
		aankomst,
		duur: Math.max(0, Math.round((ms(aankomst.verwacht) - ms(vertrek.verwacht)) / 1000)),
		tussenstops: haltes.slice(a + 1, b),
		realtime: rit.realtime,
		uitgevallen: rit.uitgevallen,
		meldingen: rit.meldingen.length ? rit.meldingen : oud.meldingen,
		polyline: oud.polyline
	};
}

function pasHalteAan(h: Halte, n: NsRitHalte | undefined): Halte {
	if (!n) return h;
	return {
		...h,
		aankomst: n.aankomst ? { gepland: h.aankomst?.gepland ?? n.aankomst.gepland, verwacht: n.aankomst.verwacht } : h.aankomst,
		vertrek: n.vertrek ? { gepland: h.vertrek?.gepland ?? n.vertrek.gepland, verwacht: n.vertrek.verwacht } : h.vertrek,
		spoor: n.spoor ?? h.spoor,
		geplandSpoor: h.geplandSpoor ?? n.geplandSpoor,
		uitgevallen: n.uitgevallen || undefined
	};
}

export function pasNsToe(leg: Leg, haltes: NsRitHalte[]): Leg {
	if (haltes.length === 0) return leg;
	const van = ritHalteBij(haltes, { naam: leg.van.naam, lat: leg.van.lat, lon: leg.van.lon });
	const naar = ritHalteBij(haltes, { naam: leg.naar.naam, lat: leg.naar.lat, lon: leg.naar.lon });
	const nieuweVan = pasHalteAan(leg.van, van);
	const nieuweNaar = pasHalteAan(leg.naar, naar);
	const vertrek = van?.vertrek ? { gepland: leg.vertrek.gepland, verwacht: van.vertrek.verwacht } : leg.vertrek;
	const aankomst = naar?.aankomst ? { gepland: leg.aankomst.gepland, verwacht: naar.aankomst.verwacht } : leg.aankomst;
	return {
		...leg,
		van: nieuweVan,
		naar: nieuweNaar,
		vertrek,
		aankomst,
		tussenstops: leg.tussenstops.map((t) => pasHalteAan(t, ritHalteBij(haltes, { naam: t.naam }))),
		drukte: van?.drukte ?? leg.drukte,
		realtime: true
	};
}

/** Looplegs opnieuw in de tijd zetten na gewijzigde OV-tijden */
export function herplanLooplegs(legs: Leg[]): Leg[] {
	const uit = legs.map((l) => ({ ...l }));
	const eersteOV = uit.findIndex(isOV);
	if (eersteOV < 0) return uit;
	// Looplegs vóór de eerste rit eindigen precies bij het vertrek van de volgende leg (achterwaarts)
	for (let i = eersteOV - 1; i >= 0; i--) {
		const eind = ms(uit[i + 1].vertrek.verwacht);
		if (Number.isNaN(eind)) continue;
		uit[i].vertrek = { ...uit[i].vertrek, verwacht: new Date(eind - uit[i].duur * 1000).toISOString() };
		uit[i].aankomst = { ...uit[i].aankomst, verwacht: new Date(eind).toISOString() };
	}
	// Looplegs na een rit beginnen bij de aankomst van de vorige leg
	for (let i = eersteOV + 1; i < uit.length; i++) {
		if (isOV(uit[i])) continue;
		const start = ms(uit[i - 1].aankomst.verwacht);
		if (Number.isNaN(start)) continue;
		uit[i].vertrek = { ...uit[i].vertrek, verwacht: new Date(start).toISOString() };
		uit[i].aankomst = { ...uit[i].aankomst, verwacht: new Date(start + uit[i].duur * 1000).toISOString() };
	}
	return uit;
}

export interface VerversOpties {
	nsKey?: string;
	/** Gedeelde cache voor ritten binnen één cron-run */
	ritCache?: Map<string, Promise<Leg | null>>;
	/** Teller van uitgaande verzoeken (subrequest-budget in Workers) */
	teller?: { aantal: number; max: number };
}

export async function verversAdvies(advies: Advies, o: VerversOpties = {}): Promise<{ advies: Advies; gewijzigd: boolean }> {
	const nu = Date.now();
	const legs = await Promise.all(
		advies.legs.map(async (leg): Promise<Leg> => {
			if (!isOV(leg)) return leg;
			if (ms(leg.aankomst.verwacht) < nu - 10 * 60000) return leg;
			if (leg.tripId) {
				try {
					let p = o.ritCache?.get(leg.tripId);
					if (!p) {
						if (o.teller) {
							if (o.teller.aantal >= o.teller.max) return leg;
							o.teller.aantal++;
						}
						p = motisRit(leg.tripId, 6000);
						o.ritCache?.set(leg.tripId, p);
					}
					const rit = await p;
					if (rit) return snijLeg(leg, rit);
				} catch {
					// probeer NS
				}
			}
			if (leg.isNS && leg.ritnummer && o.nsKey) {
				try {
					if (o.teller) {
						if (o.teller.aantal >= o.teller.max) return leg;
						o.teller.aantal++;
					}
					const haltes = await nsRit(o.nsKey, leg.ritnummer, leg.vertrek.gepland);
					return pasNsToe(leg, haltes);
				} catch {
					// oude gegevens houden
				}
			}
			return leg;
		})
	);
	const nieuw = herbereken({ ...advies, legs: herplanLooplegs(legs) });
	const gewijzigd = JSON.stringify(nieuw.legs) !== JSON.stringify(advies.legs);
	return { advies: nieuw, gewijzigd };
}
