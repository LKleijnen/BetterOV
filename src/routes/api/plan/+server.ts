import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { plan } from '$lib/server/planner';
import { mockPlan } from '$lib/server/mock';
import { foutAntwoord } from '$lib/server/antwoord';
import { plekUitParams } from '$lib/plekparams';
import { optiesUitParams, pastBij } from '$lib/reisopties';
import type { Voorkeur } from '$lib/types';
import type { RequestHandler } from './$types';

const VOORKEUREN: Voorkeur[] = ['snelst', 'overstappen', 'goedkoopst', 'drukte'];

/**
 * Plant een reis via Transitous; na 4 s zonder antwoord via NS.
 * Parameters: van, naar, via (lat,lon + Naam/Stop/Type), tijd (ISO), aankomst=1, voorkeur, cursor, bron,
 * reisopties: extraOverstap (min), vervoer (trein,bus,…), zonderReservering=1, toegankelijk=1
 */
export const GET: RequestHandler = async ({ url }) => {
	const p = url.searchParams;
	const van = plekUitParams('van', p);
	const naar = plekUitParams('naar', p);
	if (!van || !naar) return json({ fout: 'Van en naar zijn verplicht.' }, { status: 400 });
	const voorkeur = (VOORKEUREN.includes(p.get('voorkeur') as Voorkeur) ? p.get('voorkeur') : 'snelst') as Voorkeur;
	const tijd = p.get('tijd') || undefined;
	if (tijd && Number.isNaN(Date.parse(tijd))) return json({ fout: 'Ongeldige tijd.' }, { status: 400 });
	const c = config();
	const opties = optiesUitParams(p);
	if (c.mock) {
		const r = mockPlan({ van, naar, tijd, voorkeur, cursor: p.get('cursor') || undefined });
		return json({ ...r, adviezen: r.adviezen.filter((a) => pastBij(a, opties)) });
	}
	try {
		const antwoord = await plan(
			{
				van,
				naar,
				via: plekUitParams('via', p),
				tijd,
				aankomst: p.get('aankomst') === '1',
				voorkeur,
				cursor: p.get('cursor') || undefined,
				bron: p.get('bron') === 'ns' ? 'ns' : p.get('bron') === 'transitous' ? 'transitous' : undefined,
				opties
			},
			{ nsKey: c.nsKey }
		);
		return json(antwoord);
	} catch (e) {
		return foutAntwoord(e, 'Plannen mislukt.');
	}
};
