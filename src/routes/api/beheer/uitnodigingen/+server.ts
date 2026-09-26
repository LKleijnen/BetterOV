import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { foutAntwoord } from '$lib/server/antwoord';
import { lijstUitnodigingen, maakUitnodiging, status, trekIn } from '$lib/server/uitnodiging';
import type { RequestHandler } from './$types';

function controle(locals: App.Locals) {
	if (!locals.gebruiker?.admin) return json({ fout: 'Alleen voor beheerders.' }, { status: 403 });
	const sa = config().serviceAccount;
	if (!sa) return json({ fout: 'FIREBASE_SERVICE_ACCOUNT is nog niet ingesteld.' }, { status: 503 });
	return new Firestore(sa);
}

/** Uitnodigingslinks tonen (zonder de code zelf: die bestaat alleen in de link) */
export const GET: RequestHandler = async ({ locals }) => {
	const fs = controle(locals);
	if (fs instanceof Response) return fs;
	try {
		const lijst = await lijstUitnodigingen(fs);
		return json({ uitnodigingen: lijst.map((d) => ({ id: d.id, ...d.data, status: status(d.data) })) });
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** Nieuwe link maken. Body: { notitie? }. Geeft de code één keer terug. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const fs = controle(locals);
	if (fs instanceof Response) return fs;
	const { notitie } = (await request.json().catch(() => ({}))) as { notitie?: string };
	try {
		const code = await maakUitnodiging(fs, locals.gebruiker?.email, typeof notitie === 'string' ? notitie : undefined);
		return json({ code });
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** Link intrekken: ?id= */
export const DELETE: RequestHandler = async ({ locals, url }) => {
	const fs = controle(locals);
	if (fs instanceof Response) return fs;
	try {
		await trekIn(fs, url.searchParams.get('id') ?? '');
		return json({ ok: true });
	} catch (e) {
		return foutAntwoord(e);
	}
};
