import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { foutAntwoord } from '$lib/server/antwoord';
import { vergeetToegang } from '$lib/server/auth';
import { wisselIn } from '$lib/server/uitnodiging';
import type { RequestHandler } from './$types';

const REDENEN = {
	ongeldig: 'Deze uitnodigingslink klopt niet (meer). Vraag om een nieuwe link.',
	gebruikt: 'Deze uitnodigingslink is al gebruikt. Vraag om een nieuwe link.',
	verlopen: 'Deze uitnodigingslink is verlopen. Vraag om een nieuwe link.'
};

/**
 * Uitnodiging inwisselen. Body: { code }. Mag ook zonder toegang (daar is de link voor),
 * maar wel ingelogd met een geverifieerd Google-account.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const g = locals.gebruiker;
	if (!g || g.demo) return json({ fout: 'Log eerst in.' }, { status: 401 });
	if (g.toegestaan) return json({ ok: true, alToegang: true });
	const sa = config().serviceAccount;
	if (!sa) return json({ fout: 'FIREBASE_SERVICE_ACCOUNT is nog niet ingesteld.' }, { status: 503 });
	const { code } = (await request.json().catch(() => ({}))) as { code?: unknown };
	try {
		const r = await wisselIn(new Firestore(sa), String(code ?? ''), g.email);
		if (!r.ok) return json({ fout: REDENEN[r.reden] }, { status: 410 });
		vergeetToegang(g.email);
		return json({ ok: true });
	} catch (e) {
		return foutAntwoord(e, 'Uitnodiging verwerken mislukt.');
	}
};
