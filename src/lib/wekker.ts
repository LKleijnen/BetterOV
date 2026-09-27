// Waarschuwing voor de laatste trein naar huis: wanneer welke melding. Gedeeld door de app
// (uitleg) en de cron-worker (versturen). Alleen relatieve imports, voor de cron-worker.

import type { Advies } from './types';
import { klok, ms } from './tijd';
import { isOV, vindProblemen } from './reis';

/** Meldingen zoveel minuten voordat je moet vertrekken */
export const WEKKER_MINUTEN = [30, 10];
/** Tot hoe lang na het vertrek de wekker blijft bestaan */
export const WEKKER_NA_MS = 10 * 60000;

export interface WekkerMelding {
	sleutel: string;
	titel: string;
	tekst: string;
}

/** Welke melding is nu aan de beurt (nog niet eerder verstuurd)? */
export function wekkerMelding(advies: Advies, gemeld: string[], nu = Date.now()): WekkerMelding | null {
	const vertrek = ms(advies.vertrek.verwacht);
	const minuten = (vertrek - nu) / 60000;
	const eerste = advies.legs.find(isOV);
	const waar = eerste ? `${eerste.van.naam}${eerste.van.spoor ? `, spoor ${eerste.van.spoor}` : ''}` : '';
	// Uitval of een onhaalbare overstap gaat voor
	const ernstig = vindProblemen(advies, nu).find((p) => p.ernstig);
	if (ernstig && minuten > -5) {
		const sleutel = `probleem:${ernstig.sleutel}`;
		if (!gemeld.includes(sleutel)) {
			return { sleutel, titel: 'Laatste trein naar huis: let op', tekst: `${ernstig.tekst} Open de app voor een alternatief.` };
		}
	}
	for (const m of [...WEKKER_MINUTEN].sort((a, b) => a - b)) {
		if (minuten <= m && minuten > -2) {
			const sleutel = `min:${m}`;
			// Een latere drempel telt ook voor de eerdere: na de 10-minutenmelding geen 30-minutenmelding meer
			if (gemeld.some((g) => g.startsWith('min:') && Number(g.slice(4)) <= m)) return null;
			const over = Math.max(0, Math.round(minuten));
			return {
				sleutel,
				titel: over <= 1 ? 'Vertrek nu naar je laatste trein' : `Over ${over} min vertrekken`,
				tekst: `Laatste verbinding naar huis: ${eerste ? `${klok(eerste.vertrek.verwacht)} vanaf ${waar}` : `vertrek ${klok(advies.vertrek.verwacht)}`}.`
			};
		}
	}
	return null;
}

export function wekkerVerlopen(advies: Advies, nu = Date.now()): boolean {
	return nu > ms(advies.vertrek.verwacht) + WEKKER_NA_MS;
}
