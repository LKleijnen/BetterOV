import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import type { RequestHandler } from './$types';

/** Wie ben ik, en mag ik de app gebruiken? */
export const GET: RequestHandler = async ({ locals }) => {
	const g = locals.gebruiker;
	const c = config();
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
