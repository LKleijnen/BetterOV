import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { foutAntwoord } from '$lib/server/antwoord';
import { normaliseerEmail } from '$lib/server/auth';
import type { RequestHandler } from './$types';

function controle(locals: App.Locals) {
	if (!locals.gebruiker?.admin) return json({ fout: 'Alleen voor beheerders.' }, { status: 403 });
	const sa = config().serviceAccount;
	if (!sa) return json({ fout: 'FIREBASE_SERVICE_ACCOUNT is nog niet ingesteld.' }, { status: 503 });
	return new Firestore(sa);
}

const geldig = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Allowlist tonen */
export const GET: RequestHandler = async ({ locals }) => {
	const fs = controle(locals);
	if (fs instanceof Response) return fs;
	try {
		const docs = await fs.lijst<{ toegevoegdOp?: string; toegevoegdDoor?: string }>('allowlist');
		// Eén regel per persoon, ook als er varianten met en zonder puntjes bestaan
		const perPersoon = new Map<string, { email: string; toegevoegdOp?: string }>();
		for (const d of docs) {
			const sleutel = normaliseerEmail(d.id);
			if (!perPersoon.has(sleutel)) perPersoon.set(sleutel, { email: d.id, toegevoegdOp: d.data.toegevoegdOp });
		}
		return json({
			emails: [...perPersoon.values()],
			beheerders: config().beheerders
		});
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** E-mailadres toevoegen. Body: { email } */
export const POST: RequestHandler = async ({ locals, request }) => {
	const fs = controle(locals);
	if (fs instanceof Response) return fs;
	const { email } = (await request.json().catch(() => ({}))) as { email?: string };
	const schoon = email?.trim().toLowerCase();
	if (!schoon || !geldig(schoon)) return json({ fout: 'Ongeldig e-mailadres.' }, { status: 400 });
	try {
		// Gmail genormaliseerd opslaan (zonder puntjes), zodat elke schrijfwijze werkt
		await fs.zet(`allowlist/${normaliseerEmail(schoon)}`, { toegevoegdOp: new Date().toISOString(), toegevoegdDoor: locals.gebruiker?.email });
		return json({ ok: true });
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** E-mailadres verwijderen: ?email= */
export const DELETE: RequestHandler = async ({ locals, url }) => {
	const fs = controle(locals);
	if (fs instanceof Response) return fs;
	const email = url.searchParams.get('email')?.trim().toLowerCase();
	if (!email) return json({ fout: 'email is verplicht' }, { status: 400 });
	try {
		// Alle varianten verwijderen (met en zonder puntjes bij Gmail)
		const doel = normaliseerEmail(email);
		const docs = await fs.lijst('allowlist');
		for (const d of docs) if (d.id === email || normaliseerEmail(d.id) === doel) await fs.verwijder(d.pad);
		return json({ ok: true });
	} catch (e) {
		return foutAntwoord(e);
	}
};
