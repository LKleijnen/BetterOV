import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import type { RequestHandler } from './$types';

/** Wie ben ik, en mag ik de app gebruiken? */
export const GET: RequestHandler = async ({ locals }) => {
	const g = locals.gebruiker;
	const c = config();
	// Wie toegang heeft, krijgt een allowlist-regel op zijn exacte adres (zoals Google het doorgeeft),
	// zodat de Firestore-regels hem ook toelaten, ook als hij als beheerder of met puntjes is uitgenodigd
	if (g?.toegestaan && !g.demo && c.serviceAccount) {
		const fs = new Firestore(c.serviceAccount);
		const bestaat = await fs.get(`allowlist/${g.email}`).catch(() => null);
		if (!bestaat) {
			await fs
				.zet(`allowlist/${g.email}`, { toegevoegdOp: new Date().toISOString(), toegevoegdDoor: g.admin ? 'beheerder' : 'automatisch' })
				.catch((e) => console.error('Beheerder op allowlist zetten mislukt', e));
		}
	}
	return json({
		email: g?.email,
		toegestaan: !!g?.toegestaan,
		admin: !!g?.admin,
		demo: !!g?.demo,
		nsIngesteld: !!c.nsKey,
		pushIngesteld: !!c.serviceAccount,
		mock: c.mock,
		// Hulp bij het instellen: waarom iemand (nog) geen toegang heeft
		diagnose: g?.toegestaan
			? undefined
			: { beheerders: c.beheerders.length, serviceAccount: !!c.serviceAccount, fout: g?.toegangsFout }
	});
};
