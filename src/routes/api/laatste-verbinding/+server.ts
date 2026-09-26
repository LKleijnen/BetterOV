import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { laatsteVerbinding } from '$lib/server/laatste';
import { mockPlan } from '$lib/server/mock';
import { foutAntwoord } from '$lib/server/antwoord';
import { plekUitParams } from '$lib/plekparams';
import type { RequestHandler } from './$types';

/** Laatste reis naar huis vanaf de huidige locatie. Parameters: van, naar (zoals bij /api/plan) */
export const GET: RequestHandler = async ({ url }) => {
	const van = plekUitParams('van', url.searchParams);
	const naar = plekUitParams('naar', url.searchParams);
	if (!van || !naar) return json({ fout: 'Van en naar zijn verplicht.' }, { status: 400 });
	const c = config();
	if (c.mock) {
		const r = mockPlan({ van, naar, voorkeur: 'snelst', tijd: new Date(Date.now() + 3 * 3600 * 1000).toISOString() });
		const advies = r.adviezen.sort((a, b) => Date.parse(b.vertrek.verwacht) - Date.parse(a.vertrek.verwacht))[0];
		return json({
			advies,
			spelingMin: Math.floor((Date.parse(advies.vertrek.verwacht) - Date.now()) / 60000),
			bron: 'transitous',
			opgehaaldOp: new Date().toISOString()
		});
	}
	try {
		return json(await laatsteVerbinding(van, naar, c.nsKey));
	} catch (e) {
		return foutAntwoord(e, 'Laatste verbinding zoeken mislukt.');
	}
};
