// Geschatte voertuigpositie op het traject, op basis van realtime tijden per halte en de routegeometrie.

import type { Halte, Leg, VoertuigPositie } from './types';
import { decodeerPolyline, dichtstbijzijndeIndex, puntOpLijn } from './geo';
import { ms } from './tijd';

export function legLijn(leg: Leg): [number, number][] {
	if (leg.polyline?.punten) {
		const punten = decodeerPolyline(leg.polyline.punten, leg.polyline.precisie);
		if (punten.length >= 2) return punten;
	}
	return [leg.van, ...leg.tussenstops, leg.naar].map((h) => [h.lon, h.lat] as [number, number]);
}

export function geschattePositie(leg: Leg, nu = Date.now()): VoertuigPositie | null {
	const haltes: Halte[] = [leg.van, ...leg.tussenstops, leg.naar];
	const tijden = haltes.map((h, i) => {
		const aankomst = i === 0 ? ms(leg.vertrek.verwacht) : ms(h.aankomst?.verwacht ?? h.vertrek?.verwacht);
		const vertrek = i === haltes.length - 1 ? ms(leg.aankomst.verwacht) : ms(h.vertrek?.verwacht ?? h.aankomst?.verwacht);
		return { aankomst, vertrek };
	});
	const lijn = legLijn(leg);
	const tijd = new Date(nu).toISOString();
	if (nu <= tijden[0].vertrek) return { lat: leg.van.lat, lon: leg.van.lon, tijd, soort: 'geschat' };
	if (nu >= tijden[tijden.length - 1].aankomst) return { lat: leg.naar.lat, lon: leg.naar.lon, tijd, soort: 'geschat' };
	for (let i = 0; i < haltes.length - 1; i++) {
		const a = tijden[i];
		const b = tijden[i + 1];
		if (Number.isNaN(a.vertrek) || Number.isNaN(b.aankomst)) continue;
		if (nu >= a.aankomst && nu <= a.vertrek) return { lat: haltes[i].lat, lon: haltes[i].lon, tijd, soort: 'geschat' };
		if (nu > a.vertrek && nu < b.aankomst) {
			const f = (nu - a.vertrek) / Math.max(1, b.aankomst - a.vertrek);
			const i1 = dichtstbijzijndeIndex(lijn, haltes[i].lat, haltes[i].lon);
			const i2 = dichtstbijzijndeIndex(lijn, haltes[i + 1].lat, haltes[i + 1].lon);
			const stuk = i2 > i1 ? lijn.slice(i1, i2 + 1) : [
				[haltes[i].lon, haltes[i].lat] as [number, number],
				[haltes[i + 1].lon, haltes[i + 1].lat] as [number, number]
			];
			const p = puntOpLijn(stuk, f);
			if (p) return { lat: p[1], lon: p[0], tijd, soort: 'geschat' };
		}
	}
	return null;
}
