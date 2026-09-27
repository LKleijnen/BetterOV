import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { ritHistorie } from '$lib/server/materieel';
import { mockHistorie } from '$lib/server/mock';
import { foutAntwoord } from '$lib/server/antwoord';
import type { RequestHandler } from './$types';

/** Eerder gereden ritten van treinstellen. Parameter: nummers (komma's, hooguit 4) */
export const GET: RequestHandler = async ({ url }) => {
	const nummers = (url.searchParams.get('nummers') ?? '').split(',').filter(Boolean);
	const c = config();
	if (c.mock) return json({ historie: mockHistorie(nummers) });
	if (!c.serviceAccount) return json({ historie: {} });
	try {
		return json({ historie: await ritHistorie(new Firestore(c.serviceAccount), nummers) });
	} catch (e) {
		return foutAntwoord(e, 'Eerdere ritten ophalen mislukt.');
	}
};
