// Prijs per reisadvies: exacte NS-prijs voor NS-treinen, schatting uit tarieven.json voor de rest.

import type { Advies, Leg, Prijs, PrijsOnderdeel } from '../types';
import tarieven from '../data/tarieven.json';
import { afstandMeter, decodeerPolyline, lijnLengte } from '../geo';
import { isOV } from '../reis';
import { nsPrijs, stationVoorPlek, type NsStation } from './ns';

export function legAfstandKm(leg: Leg): number {
	if (leg.polyline?.punten) {
		const m = lijnLengte(decodeerPolyline(leg.polyline.punten, leg.polyline.precisie));
		if (m > 0) return m / 1000;
	}
	if (leg.afstand) return leg.afstand / 1000;
	const punten = [leg.van, ...leg.tussenstops, leg.naar];
	let m = 0;
	for (let i = 1; i < punten.length; i++) m += afstandMeter(punten[i - 1].lat, punten[i - 1].lon, punten[i].lat, punten[i].lon);
	return (m * 1.15) / 1000;
}

export function schattingTrein(km: number): number {
	const t = tarieven.trein;
	let rest = km;
	let vorige = 0;
	let euro = t.basis;
	for (const schijf of t.schijven) {
		const deel = Math.min(rest, schijf.totKm - vorige);
		if (deel <= 0) break;
		euro += deel * schijf.perKm;
		rest -= deel;
		vorige = schijf.totKm;
	}
	return Math.round(Math.max(t.minimum, euro) * 100);
}

function kmTariefBTM(vervoerder?: string): number {
	const lijst = tarieven.busTramMetro.perKmPerVervoerder as Record<string, number>;
	if (vervoerder) {
		const sleutel = Object.keys(lijst).find((k) => vervoerder.toLowerCase().includes(k.toLowerCase()));
		if (sleutel) return lijst[sleutel];
	}
	return tarieven.busTramMetro.perKmStandaard;
}

function euro(cent: number): string {
	return `€ ${(cent / 100).toFixed(2).replace('.', ',')}`;
}

export async function berekenPrijs(advies: Advies, nsKey: string | undefined, stations: NsStation[]): Promise<Prijs | undefined> {
	const ov = advies.legs.filter(isOV);
	if (ov.length === 0) return { bedrag: 0, exact: true, onderdelen: [] };
	if (advies.prijs && ov.every((l) => l.modus === 'trein')) return advies.prijs;

	const onderdelen: PrijsOnderdeel[] = [];

	// 1. Treinen groeperen per aaneengesloten reeks van dezelfde soort (NS of andere vervoerder)
	let i = 0;
	const legs = advies.legs;
	let laatsteBTMAankomst = -Infinity;
	while (i < legs.length) {
		const leg = legs[i];
		if (!isOV(leg)) {
			i++;
			continue;
		}
		if (leg.modus === 'trein') {
			const groep: Leg[] = [leg];
			let j = i + 1;
			while (j < legs.length) {
				const volgende = legs[j];
				if (!isOV(volgende)) {
					j++;
					continue;
				}
				if (volgende.modus === 'trein' && volgende.isNS === leg.isNS && (leg.isNS || volgende.vervoerder === leg.vervoerder)) {
					groep.push(volgende);
					j++;
				} else break;
			}
			const km = groep.reduce((s, l) => s + legAfstandKm(l), 0);
			const eerste = groep[0];
			const laatste = groep[groep.length - 1];
			let bedrag: number | null = null;
			if (leg.isNS && nsKey) {
				const van = stationVoorPlek(stations, { naam: eerste.van.naam, lat: eerste.van.lat, lon: eerste.van.lon, type: 'station' });
				const naar = stationVoorPlek(stations, { naam: laatste.naar.naam, lat: laatste.naar.lat, lon: laatste.naar.lon, type: 'station' });
				if (van && naar) bedrag = await nsPrijs(nsKey, van.code, naar.code).catch(() => null);
			}
			const omschrijving = `Trein ${eerste.van.naam} – ${laatste.naar.naam}${leg.isNS ? '' : ` (${leg.vervoerder ?? 'andere vervoerder'})`}`;
			onderdelen.push(
				bedrag !== null
					? { omschrijving, bedrag, exact: true }
					: { omschrijving, bedrag: schattingTrein(km), exact: false }
			);
			// i verder zetten tot na de laatste leg van de groep
			i = legs.indexOf(laatste) + 1;
			continue;
		}
		// Bus, tram, metro, veer: opstaptarief bij de eerste rit of na meer dan 35 min overstaptijd
		const vertrek = Date.parse(leg.vertrek.verwacht);
		const nieuwOpstap = vertrek - laatsteBTMAankomst > tarieven.busTramMetro.overstapMinuten * 60000;
		const km = legAfstandKm(leg);
		const cent = Math.round(
			((nieuwOpstap ? tarieven.busTramMetro.opstaptarief : 0) + km * kmTariefBTM(leg.vervoerder)) * 100
		);
		onderdelen.push({
			omschrijving: `${leg.productNaam ?? 'Bus'} ${leg.lijn ?? ''} ${leg.van.naam} – ${leg.naar.naam}`.replace(/\s+/g, ' ').trim(),
			bedrag: cent,
			exact: false
		});
		laatsteBTMAankomst = Date.parse(leg.aankomst.verwacht);
		i++;
	}

	const bedrag = onderdelen.reduce((s, o) => s + o.bedrag, 0);
	return { bedrag, exact: onderdelen.every((o) => o.exact), onderdelen };
}

export { euro as euroTekst };
