import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { verversAdvies } from '$lib/server/reisstatus';
import { foutAntwoord } from '$lib/server/antwoord';
import { vindProblemen } from '$lib/reis';
import type { Advies } from '$lib/types';
import type { RequestHandler } from './$types';

/** Ververst een lopende reis met realtime-data en geeft de problemen terug. Body: { advies } */
export const POST: RequestHandler = async ({ request }) => {
	let advies: Advies;
	try {
		({ advies } = (await request.json()) as { advies: Advies });
		if (!advies?.legs?.length) throw new Error();
	} catch {
		return json({ fout: 'Ongeldige reis.' }, { status: 400 });
	}
	const c = config();
	try {
		const nieuw = c.mock ? { advies, gewijzigd: false } : await verversAdvies(advies, { nsKey: c.nsKey });
		return json({
			advies: nieuw.advies,
			gewijzigd: nieuw.gewijzigd,
			problemen: vindProblemen(nieuw.advies),
			opgehaaldOp: new Date().toISOString()
		});
	} catch (e) {
		return foutAntwoord(e, 'Reisstatus ophalen mislukt.');
	}
};
