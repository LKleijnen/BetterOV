import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { nsTreinPositie } from '$lib/server/ns';
import type { RequestHandler } from './$types';

/** GPS-positie van een NS-trein. Geeft null als die niet bekend is (de app schat dan zelf). */
export const GET: RequestHandler = async ({ url }) => {
	const ritnummer = url.searchParams.get('ritnummer');
	const c = config();
	if (!ritnummer || !c.nsKey || c.mock) return json(null);
	try {
		return json(await nsTreinPositie(c.nsKey, ritnummer));
	} catch {
		return json(null);
	}
};
