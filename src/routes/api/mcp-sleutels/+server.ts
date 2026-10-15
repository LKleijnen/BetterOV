import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { foutAntwoord } from '$lib/server/antwoord';
import { lijstSleutels, maakSleutel, trekSleutelIn } from '$lib/server/mcpsleutel';
import type { RequestHandler } from './$types';

// Sleutels waarmee een AI-assistent via /api/mcp namens jou mag werken. Alleen voor jezelf:
// iedereen beheert zijn eigen sleutels.

function opslag(locals: App.Locals) {
	if (!locals.gebruiker?.uid || locals.gebruiker.demo) {
		return json({ fout: 'MCP-sleutels werken alleen als je bent ingelogd (niet in demo-modus).' }, { status: 403 });
	}
	const sa = config().serviceAccount;
	if (!sa) return json({ fout: 'FIREBASE_SERVICE_ACCOUNT is nog niet ingesteld.' }, { status: 503 });
	return new Firestore(sa);
}

/** Mijn sleutels (nooit de sleutel zelf: daarvan staat alleen een hash op de server) */
export const GET: RequestHandler = async ({ locals }) => {
	const fs = opslag(locals);
	if (fs instanceof Response) return fs;
	try {
		const docs = await lijstSleutels(fs, locals.gebruiker!.uid);
		return json({
			sleutels: docs.map((d) => ({
				id: d.id,
				naam: d.data.naam,
				staart: d.data.staart,
				aangemaaktOp: d.data.aangemaaktOp,
				laatstGebruiktOp: d.data.laatstGebruiktOp
			}))
		});
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** Nieuwe sleutel. Body: { naam } */
export const POST: RequestHandler = async ({ locals, request }) => {
	const fs = opslag(locals);
	if (fs instanceof Response) return fs;
	const { naam } = (await request.json().catch(() => ({}))) as { naam?: string };
	try {
		const g = locals.gebruiker!;
		const { sleutel, id } = await maakSleutel(fs, { uid: g.uid, email: g.email }, naam);
		return json({ sleutel, id });
	} catch (e) {
		return foutAntwoord(e);
	}
};

/** Sleutel intrekken: ?id= */
export const DELETE: RequestHandler = async ({ locals, url }) => {
	const fs = opslag(locals);
	if (fs instanceof Response) return fs;
	const id = url.searchParams.get('id') ?? '';
	try {
		await trekSleutelIn(fs, locals.gebruiker!.uid, id);
		return json({ ok: true });
	} catch (e) {
		return foutAntwoord(e);
	}
};
