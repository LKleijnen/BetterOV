import { json } from '@sveltejs/kit';
import { ApiFout } from './http';

/** Zet een fout om in een JSON-antwoord met een Nederlandse melding */
export function foutAntwoord(e: unknown, standaard = 'Er ging iets mis.') {
	if (e instanceof ApiFout) {
		const status = e.status >= 400 && e.status < 600 ? (e.status >= 500 ? 502 : e.status) : 504;
		const bron = e.bron === 'transitous' ? 'Transitous' : e.bron === 'ns' ? 'NS' : '';
		return json({ fout: bron ? `${bron}: ${e.message}` : e.message }, { status: e.bron === 'plan' ? 503 : status });
	}
	console.error(e);
	return json({ fout: standaard }, { status: 500 });
}

export function getal(v: string | null): number | undefined {
	if (v === null || v === '') return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}
