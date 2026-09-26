// GPS-hulpfuncties. GPS wordt alleen gebruikt voor "Nu vertrekken", laatste verbinding en live positie.

export interface Positie {
	lat: number;
	lon: number;
	nauwkeurigheid: number;
	tijd: number;
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
				laatste = { lat: p.coords.latitude, lon: p.coords.longitude, nauwkeurigheid: p.coords.accuracy, tijd: p.timestamp };
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
	const id = navigator.geolocation.watchPosition(
		(p) => {
			laatste = { lat: p.coords.latitude, lon: p.coords.longitude, nauwkeurigheid: p.coords.accuracy, tijd: p.timestamp };
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
