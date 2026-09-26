import { json, type Handle } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { controleerIdToken, opAllowlist } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const pad = event.url.pathname;

	if (pad.startsWith('/api/')) {
		const c = config();
		if (c.authActief && c.projectId) {
			const kop = event.request.headers.get('authorization') ?? '';
			const token = kop.startsWith('Bearer ') ? kop.slice(7) : '';
			const gebruiker = token ? await controleerIdToken(token, c.projectId) : null;
			if (!gebruiker) return json({ fout: 'Je bent niet ingelogd.' }, { status: 401 });
			const admin = c.beheerders.includes(gebruiker.email);
			const toegestaan = await opAllowlist(gebruiker.email, c.serviceAccount, c.beheerders).catch(() => false);
			event.locals.gebruiker = { ...gebruiker, admin, toegestaan, demo: false };
			if (!toegestaan && pad !== '/api/ik') {
				return json({ fout: 'Geen toegang: je e-mailadres staat niet op de uitnodigingslijst.' }, { status: 403 });
			}
		} else {
			event.locals.gebruiker = { uid: 'demo', email: 'demo@lokaal', admin: true, toegestaan: true, demo: true };
		}
	}

	const antwoord = await resolve(event);
	antwoord.headers.set('x-content-type-options', 'nosniff');
	antwoord.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	if (pad.startsWith('/api/')) antwoord.headers.set('cache-control', 'no-store');
	return antwoord;
};
