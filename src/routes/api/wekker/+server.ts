import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { foutAntwoord } from '$lib/server/antwoord';
import type { Advies, LaatsteTreinWekker, Plek } from '$lib/types';
import type { RequestHandler } from './$types';

// Waarschuwing voor de laatste trein naar huis. De cron-worker leest de collectie en stuurt
// pushmeldingen; zonder service account (demo) alleen in het geheugen, voor het uitproberen.
const COLLECTIE = 'laatsteTreinWekkers';
const demo = new Map<string, LaatsteTreinWekker>();

function opslag() {
	const sa = config().serviceAccount;
	return sa ? new Firestore(sa) : null;
}

/** Staat er een waarschuwing? Geeft het advies terug, of null */
export const GET: RequestHandler = async ({ locals }) => {
	const uid = locals.gebruiker?.uid;
	if (!uid) return json({ fout: 'Log eerst in.' }, { status: 401 });
	const fs = opslag();
	try {
		const w = fs ? (await fs.get<LaatsteTreinWekker>(`${COLLECTIE}/${uid}`))?.data : demo.get(uid);
		return json({ wekker: w ? { advies: w.advies, van: w.van, naar: w.naar } : null });
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** Waarschuwing aanzetten. Body: { advies, van, naar } */
export const POST: RequestHandler = async ({ locals, request }) => {
	const uid = locals.gebruiker?.uid;
	if (!uid) return json({ fout: 'Log eerst in.' }, { status: 401 });
	const body = (await request.json().catch(() => null)) as { advies?: Advies; van?: Plek; naar?: Plek } | null;
	if (!body?.advies?.legs?.length || !body.van || !body.naar) return json({ fout: 'Ongeldige reis.' }, { status: 400 });
	if (Date.parse(body.advies.vertrek.verwacht) < Date.now()) return json({ fout: 'Deze reis is al vertrokken.' }, { status: 400 });
	const w: LaatsteTreinWekker = { uid, van: body.van, naar: body.naar, advies: body.advies, gemeld: [], aangemaaktOp: new Date().toISOString() };
	try {
		const fs = opslag();
		if (fs) await fs.zet(`${COLLECTIE}/${uid}`, JSON.parse(JSON.stringify(w)));
		else demo.set(uid, w);
		return json({ ok: true, push: !!fs });
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** Waarschuwing uitzetten */
export const DELETE: RequestHandler = async ({ locals }) => {
	const uid = locals.gebruiker?.uid;
	if (!uid) return json({ fout: 'Log eerst in.' }, { status: 401 });
	try {
		const fs = opslag();
		if (fs) await fs.verwijder(`${COLLECTIE}/${uid}`);
		else demo.delete(uid);
		return json({ ok: true });
	} catch (e) {
		return foutAntwoord(e);
	}
};
