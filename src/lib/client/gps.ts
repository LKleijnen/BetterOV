// GPS-hulpfuncties. GPS wordt alleen gebruikt voor "Nu vertrekken", laatste verbinding, live positie
// en de snelheid tijdens de reis.

import { snelheidKmu, type GpsMeting } from '$lib/geo';

export interface Positie extends GpsMeting {
	/** Snelheid in km/u (van het toestel of uit de vorige meting), als die te bepalen is */
	kmu?: number;
}

function meting(p: GeolocationPosition): GpsMeting {
	const v = p.coords.speed;
	return {
		lat: p.coords.latitude,
		lon: p.coords.longitude,
		nauwkeurigheid: p.coords.accuracy,
		tijd: p.timestamp,
		snelheid: typeof v === 'number' && Number.isFinite(v) ? v : undefined
	};
}

/** Mag de app je locatie al gebruiken zonder het te vragen? (onbekend: false) */
export async function locatieToegestaan(): Promise<boolean> {
	try {
		const s = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
		return s?.state === 'granted';
	} catch {
		return false;
	}
}

let laatste: Positie | null = null;

export function laatstePositie(): Positie | null {
	return laatste;
}

export function huidigePositie(timeoutMs = 12000, maxLeeftijdMs = 30000): Promise<Positie> {
	return new Promise((resolve, reject) => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			reject(new Error('Locatie wordt niet ondersteund op dit apparaat.'));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(p) => {
				laatste = meting(p);
				resolve(laatste);
			},
			(e) => reject(new Error(gpsFout(e))),
			{ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxLeeftijdMs }
		);
	});
}

export function volgPositie(cb: (p: Positie) => void, fout?: (melding: string) => void): () => void {
	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		fout?.('Locatie wordt niet ondersteund op dit apparaat.');
		return () => {};
	}
	let vorige: Positie | null = null;
	const id = navigator.geolocation.watchPosition(
		(p) => {
			const m = meting(p);
			// Dezelfde (gecachete) meting nog eens: niets nieuws
			if (vorige && m.tijd === vorige.tijd) return;
			laatste = { ...m, kmu: snelheidKmu(m, vorige) };
			vorige = laatste;
			cb(laatste);
		},
		(e) => fout?.(gpsFout(e)),
		{ enableHighAccuracy: true, maximumAge: 10000 }
	);
	return () => navigator.geolocation.clearWatch(id);
}

function gpsFout(e: GeolocationPositionError): string {
	if (e.code === e.PERMISSION_DENIED) return 'Geef de app toestemming om je locatie te gebruiken.';
	if (e.code === e.TIMEOUT) return 'Je locatie kon niet op tijd worden bepaald.';
	return 'Je locatie is niet beschikbaar.';
}
