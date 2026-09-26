// Treinroutes over het echte spoor: een netwerk uit de NS SpoorKaart (GeoJSON) en de kortste
// route over dat netwerk langs de haltes van een rit. Puur rekenwerk, zodat het te testen is.

import { afstandMeter } from './geo';

/** [lon, lat], zoals in GeoJSON */
export type Punt = [number, number];

interface Rand {
	a: number;
	b: number;
	lijn: Punt[];
	lengte: number;
}

export interface SpoorNetwerk {
	knopen: Punt[];
	randen: Rand[];
	/** Per knoop de indexen van de randen die erop aansluiten */
	buren: number[][];
	raster: Map<string, number[]>;
}

/** Eindpunten binnen deze afstand gelden als dezelfde plek (aansluitende spoorstukken) */
const SAMENVOEGEN_METER = 60;
const CEL = 0.002;

function lijnLengte(lijn: Punt[]): number {
	let m = 0;
	for (let i = 1; i < lijn.length; i++) m += afstandMeter(lijn[i - 1][1], lijn[i - 1][0], lijn[i][1], lijn[i][0]);
	return m;
}

function isPunt(p: unknown): p is Punt {
	return Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** Haalt alle lijnen uit een GeoJSON-antwoord, hoe het ook verpakt is (payload, features, geometrie) */
export function leesSpoorkaart(ruw: unknown): Punt[][] {
	const lijnen: Punt[][] = [];
	const bezoek = (x: unknown, diepte: number) => {
		if (!x || typeof x !== 'object' || diepte > 5) return;
		if (Array.isArray(x)) {
			for (const y of x) bezoek(y, diepte + 1);
			return;
		}
		const o = x as Record<string, unknown>;
		const type = o.type;
		const coords = o.coordinates;
		if (type === 'LineString' && Array.isArray(coords)) {
			const lijn = coords.filter(isPunt).map((p) => [p[0], p[1]] as Punt);
			if (lijn.length >= 2) lijnen.push(lijn);
			return;
		}
		if (type === 'MultiLineString' && Array.isArray(coords)) {
			for (const deel of coords) {
				if (!Array.isArray(deel)) continue;
				const lijn = deel.filter(isPunt).map((p) => [p[0], p[1]] as Punt);
				if (lijn.length >= 2) lijnen.push(lijn);
			}
			return;
		}
		for (const sleutel of ['payload', 'features', 'geometry', 'geometries']) if (sleutel in o) bezoek(o[sleutel], diepte + 1);
	};
	bezoek(ruw, 0);
	return lijnen;
}

function cel(lon: number, lat: number): [number, number] {
	return [Math.floor(lon / CEL), Math.floor(lat / CEL)];
}

function knopenInBuurt(n: SpoorNetwerk, lon: number, lat: number, straalCellen: number): number[] {
	const [cx, cy] = cel(lon, lat);
	const uit: number[] = [];
	for (let dx = -straalCellen; dx <= straalCellen; dx++) {
		for (let dy = -straalCellen; dy <= straalCellen; dy++) {
			const lijst = n.raster.get(`${cx + dx}:${cy + dy}`);
			if (lijst) uit.push(...lijst);
		}
	}
	return uit;
}

function knoopVoor(n: SpoorNetwerk, p: Punt): number {
	for (const k of knopenInBuurt(n, p[0], p[1], 1)) {
		const q = n.knopen[k];
		if (afstandMeter(p[1], p[0], q[1], q[0]) <= SAMENVOEGEN_METER) return k;
	}
	const index = n.knopen.length;
	n.knopen.push(p);
	n.buren.push([]);
	const [cx, cy] = cel(p[0], p[1]);
	const sleutel = `${cx}:${cy}`;
	n.raster.set(sleutel, [...(n.raster.get(sleutel) ?? []), index]);
	return index;
}

export function maakNetwerk(lijnen: Punt[][]): SpoorNetwerk {
	const n: SpoorNetwerk = { knopen: [], randen: [], buren: [], raster: new Map() };
	for (const lijn of lijnen) {
		const a = knoopVoor(n, lijn[0]);
		const b = knoopVoor(n, lijn[lijn.length - 1]);
		if (a === b) continue;
		const index = n.randen.length;
		n.randen.push({ a, b, lijn, lengte: lijnLengte(lijn) });
		n.buren[a].push(index);
		n.buren[b].push(index);
	}
	return n;
}

/** Dichtstbijzijnde knoop (station of aansluiting) binnen maxMeter, of -1 */
export function dichtsteKnoop(n: SpoorNetwerk, lat: number, lon: number, maxMeter = 800): number {
	let beste = -1;
	let besteAfstand = maxMeter;
	const straal = Math.ceil(maxMeter / 111000 / CEL) + 1;
	for (const k of knopenInBuurt(n, lon, lat, straal)) {
		const q = n.knopen[k];
		const d = afstandMeter(lat, lon, q[1], q[0]);
		if (d <= besteAfstand) {
			besteAfstand = d;
			beste = k;
		}
	}
	return beste;
}

/** Kortste route over het spoor tussen twee knopen (Dijkstra), als lijst punten */
export function kortsteRoute(n: SpoorNetwerk, van: number, naar: number, maxMeter = Infinity): Punt[] | null {
	if (van === naar) return [n.knopen[van]];
	const afstand = new Map<number, number>([[van, 0]]);
	const via = new Map<number, number>();
	const open = new Set<number>([van]);
	const klaar = new Set<number>();
	while (open.size > 0) {
		let k = -1;
		let kd = Infinity;
		for (const x of open) {
			const d = afstand.get(x)!;
			if (d < kd) {
				kd = d;
				k = x;
			}
		}
		if (k === naar) break;
		if (kd > maxMeter) return null;
		open.delete(k);
		klaar.add(k);
		for (const r of n.buren[k]) {
			const rand = n.randen[r];
			const ander = rand.a === k ? rand.b : rand.a;
			if (klaar.has(ander)) continue;
			const d = kd + rand.lengte;
			if (d < (afstand.get(ander) ?? Infinity)) {
				afstand.set(ander, d);
				via.set(ander, r);
				open.add(ander);
			}
		}
	}
	if (!via.has(naar)) return null;
	const stukken: Punt[][] = [];
	let k = naar;
	while (k !== van) {
		const rand = n.randen[via.get(k)!];
		// De lijn loopt van rand.a naar rand.b; achterstevoren als we de andere kant op rijden
		stukken.unshift(rand.b === k ? rand.lijn : [...rand.lijn].reverse());
		k = rand.b === k ? rand.a : rand.b;
	}
	return stukken.flatMap((s, i) => (i === 0 ? s : s.slice(1)));
}

/**
 * Route over het spoor langs een reeks haltes (in-, tussen- en uitstaphalte).
 * Geeft null als een stuk niet te vinden is of onlogisch lang wordt; dan tekent de kaart de gewone lijn.
 */
export function spoorRoute(n: SpoorNetwerk, haltes: { lat: number; lon: number }[]): Punt[] | null {
	if (haltes.length < 2) return null;
	const knopen: number[] = [];
	for (let i = 0; i < haltes.length; i++) {
		const k = dichtsteKnoop(n, haltes[i].lat, haltes[i].lon);
		const randhalte = i === 0 || i === haltes.length - 1;
		// In- en uitstaphalte moeten op het spoor liggen; een tussenhalte zonder spoorpunt slaan we over
		if (k < 0) {
			if (randhalte) return null;
			continue;
		}
		if (knopen[knopen.length - 1] !== k) knopen.push(k);
	}
	if (knopen.length < 2) return null;
	const route: Punt[] = [];
	for (let i = 1; i < knopen.length; i++) {
		const a = n.knopen[knopen[i - 1]];
		const b = n.knopen[knopen[i]];
		const hemelsbreed = afstandMeter(a[1], a[0], b[1], b[0]);
		const stuk = kortsteRoute(n, knopen[i - 1], knopen[i], hemelsbreed * 2.5 + 5000);
		if (!stuk) return null;
		route.push(...(route.length ? stuk.slice(1) : stuk));
	}
	return route;
}

/** Of een lijn al nauwkeurig genoeg is (echte vorm) of alleen rechte stukken tussen haltes */
export function isGrof(lijn: Punt[], aantalHaltes: number): boolean {
	return lijn.length < Math.max(4, aantalHaltes * 3);
}
