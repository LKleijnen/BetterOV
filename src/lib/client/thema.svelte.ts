// Weergave: licht, donker of automatisch (volgt het systeem). Per apparaat bewaard.
// Het script in app.html zet de keuze al vóór het eerste beeld, zodat er niets knippert.

import { lees, schrijf } from './opslag';

export type Thema = 'systeem' | 'licht' | 'donker';

const KLEUR = { licht: '#f4f5f7', donker: '#0e1116' };

class Weergave {
	thema = $state<Thema>(lees<Thema>('thema', 'systeem'));

	zet(t: Thema) {
		this.thema = t;
		schrijf('thema', t);
		pasToe(t);
	}

	/** Is de app nu donker (ook als dat van het systeem komt)? */
	get donker(): boolean {
		if (this.thema !== 'systeem') return this.thema === 'donker';
		return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
	}
}

function pasToe(t: Thema) {
	if (typeof document === 'undefined') return;
	const html = document.documentElement;
	if (t === 'systeem') delete html.dataset.thema;
	else html.dataset.thema = t;
	// Kleur van de statusbalk: bij een vaste keuze beide varianten gelijk zetten
	for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		const systeemDonker = meta.media.includes('dark');
		meta.content = t === 'systeem' ? KLEUR[systeemDonker ? 'donker' : 'licht'] : KLEUR[t];
	}
}

export const weergave = new Weergave();
pasToe(weergave.thema);
