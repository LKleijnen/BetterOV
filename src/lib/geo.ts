// Geografische hulpfuncties, gedeeld tussen client, server en cron.

const AARDSTRAAL = 6371008.8;

export function afstandMeter(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * AARDSTRAAL * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Loopsnelheid in m/s (4,8 km/u) */
export const LOOPSNELHEID = 1.33;
/** Omweg ten opzichte van hemelsbreed */
export const OMWEGFACTOR = 1.3;

/** Geschatte looptijd in seconden tussen twee punten */
export function looptijdSeconden(lat1: number, lon1: number, lat2: number, lon2: number): number {
	return Math.round((afstandMeter(lat1, lon1, lat2, lon2) * OMWEGFACTOR) / LOOPSNELHEID);
}

/** Decodeert een Google-polyline naar [lon, lat]-paren (GeoJSON-volgorde). */
export function decodeerPolyline(punten: string, precisie = 5): [number, number][] {
	const factor = 10 ** precisie;
	const resultaat: [number, number][] = [];
	let index = 0;
	let lat = 0;
	let lon = 0;
	while (index < punten.length) {
		let verschuiving = 0;
		let waarde = 0;
		let byte: number;
		do {
			byte = punten.charCodeAt(index++) - 63;
			waarde |= (byte & 0x1f) << verschuiving;
			verschuiving += 5;
		} while (byte >= 0x20 && index < punten.length);
		lat += waarde & 1 ? ~(waarde >> 1) : waarde >> 1;
		verschuiving = 0;
		waarde = 0;
		do {
			byte = punten.charCodeAt(index++) - 63;
			waarde |= (byte & 0x1f) << verschuiving;
			verschuiving += 5;
		} while (byte >= 0x20 && index < punten.length);
		lon += waarde & 1 ? ~(waarde >> 1) : waarde >> 1;
		resultaat.push([lon / factor, lat / factor]);
	}
	return resultaat;
}

/** Codeert [lon, lat]-paren als Google-polyline. */
export function codeerPolyline(coords: [number, number][], precisie = 5): string {
	const factor = 10 ** precisie;
	let vorigeLat = 0;
	let vorigeLon = 0;
	let uit = '';
	const codeer = (getal: number) => {
		let v = getal < 0 ? ~(getal << 1) : getal << 1;
		let s = '';
		while (v >= 0x20) {
			s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
			v >>= 5;
		}
		return s + String.fromCharCode(v + 63);
	};
	for (const [lon, lat] of coords) {
		const la = Math.round(lat * factor);
		const lo = Math.round(lon * factor);
		uit += codeer(la - vorigeLat) + codeer(lo - vorigeLon);
		vorigeLat = la;
		vorigeLon = lo;
	}
	return uit;
}

/** Lengte van een lijn in meters */
export function lijnLengte(coords: [number, number][]): number {
	let totaal = 0;
	for (let i = 1; i < coords.length; i++) {
		totaal += afstandMeter(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
	}
	return totaal;
}

/** Punt op een fractie (0..1) van de lijn */
export function puntOpLijn(coords: [number, number][], fractie: number): [number, number] | null {
	if (coords.length === 0) return null;
	if (coords.length === 1 || fractie <= 0) return coords[0];
	if (fractie >= 1) return coords[coords.length - 1];
	const totaal = lijnLengte(coords);
	let doel = totaal * fractie;
	for (let i = 1; i < coords.length; i++) {
		const stuk = afstandMeter(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
		if (doel <= stuk && stuk > 0) {
			const t = doel / stuk;
			return [
				coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
				coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t
			];
		}
		doel -= stuk;
	}
	return coords[coords.length - 1];
}

/** Index van het lijnpunt dat het dichtst bij een coördinaat ligt */
export function dichtstbijzijndeIndex(coords: [number, number][], lat: number, lon: number): number {
	let beste = 0;
	let besteAfstand = Infinity;
	for (let i = 0; i < coords.length; i++) {
		const d = afstandMeter(lat, lon, coords[i][1], coords[i][0]);
		if (d < besteAfstand) {
			besteAfstand = d;
			beste = i;
		}
	}
	return beste;
}
