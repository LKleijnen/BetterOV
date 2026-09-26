import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import type { RequestHandler } from './$types';

/** Wie ben ik, en mag ik de app gebruiken? */
export const GET: RequestHandler = async ({ locals }) => {
	const g = locals.gebruiker;
	const c = config();
	// Beheerders staan automatisch op de allowlist, zodat de Firestore-regels ze ook toelaten
	if (g?.admin && !g.demo && c.serviceAccount) {
		const fs = new Firestore(c.serviceAccount);
		const bestaat = await fs.get(`allowlist/${g.email}`).catch(() => null);
		if (!bestaat) {
			await fs
				.zet(`allowlist/${g.email}`, { toegevoegdOp: new Date().toISOString(), toegevoegdDoor: 'beheerder' })
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
		mock: c.mock
	});
};
