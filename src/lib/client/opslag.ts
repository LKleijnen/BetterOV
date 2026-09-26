// Veilige toegang tot localStorage (kan ontbreken of falen in privévensters).

export function lees<T>(sleutel: string, standaard: T): T {
	try {
		const ruw = localStorage.getItem(sleutel);
		return ruw ? (JSON.parse(ruw) as T) : standaard;
	} catch {
		return standaard;
	}
}

export function schrijf(sleutel: string, waarde: unknown): void {
	try {
		localStorage.setItem(sleutel, JSON.stringify(waarde));
	} catch {
		// Vol of geblokkeerd: oudste API-cache opruimen en nog één keer proberen
		try {
			for (const k of Object.keys(localStorage)) if (k.startsWith('cache:')) localStorage.removeItem(k);
			localStorage.setItem(sleutel, JSON.stringify(waarde));
		} catch {
			// negeren
		}
	}
}

export function wis(sleutel: string): void {
	try {
		localStorage.removeItem(sleutel);
	} catch {
		// negeren
	}
}
