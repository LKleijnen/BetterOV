import { json, type Handle, type RequestEvent } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { controleerAllowlist, controleerIdToken, isBeheerder } from '$lib/server/auth';
import { Firestore } from '$lib/server/firestore';
import { eigenaarVanSleutel, geldigeSleutel } from '$lib/server/mcpsleutel';

/** Het MCP-endpoint voor AI-assistenten; daar mag je ook met een MCP-sleutel inloggen */
const MCP_PAD = '/api/mcp';

/** Koppen bij een weigering op /api/mcp: ook een client in de browser moet de melding kunnen lezen */
const MCP_FOUTKOPPEN = { 'access-control-allow-origin': '*' };
const UITDAGING = { ...MCP_FOUTKOPPEN, 'www-authenticate': 'Bearer realm="BetterOV", error="invalid_token"' };

/** Een MCP-sleutel uit de kop (gewoonlijk), of uit de URL voor clients die alleen een link aankunnen */
function mcpSleutel(event: RequestEvent): string | null {
	const kop = event.request.headers.get('authorization') ?? '';
	const kandidaten = [
		kop.startsWith('Bearer ') ? kop.slice(7).trim() : '',
		event.request.headers.get('x-mcp-sleutel')?.trim() ?? '',
		event.url.searchParams.get('sleutel')?.trim() ?? ''
	];
	return kandidaten.find(geldigeSleutel) ?? null;
}

export const handle: Handle = async ({ event, resolve }) => {
	const pad = event.url.pathname;

	if (pad.startsWith('/api/')) {
		const c = config();
		const sleutel = pad === MCP_PAD ? mcpSleutel(event) : null;
		// Een MCP-client vraagt eerst welke koppen mogen (CORS); daar hoort nog geen sleutel bij
		if (pad === MCP_PAD && event.request.method === 'OPTIONS') return resolve(event);

		if (sleutel) {
			if (!c.serviceAccount) {
				return json({ fout: 'MCP-sleutels werken alleen als Firebase is ingesteld.' }, { status: 503, headers: MCP_FOUTKOPPEN });
			}
			const eigenaar = await eigenaarVanSleutel(new Firestore(c.serviceAccount), sleutel);
			if (!eigenaar) {
				return json({ fout: 'Deze MCP-sleutel is niet (meer) geldig. Maak een nieuwe in de app.' }, { status: 401, headers: UITDAGING });
			}
			const uitslag = await controleerAllowlist(eigenaar.email, c.serviceAccount, c.beheerders);
			if (!uitslag.toegestaan) {
				return json({ fout: 'Geen toegang: dit e-mailadres staat niet (meer) op de uitnodigingslijst.' }, { status: 403, headers: MCP_FOUTKOPPEN });
			}
			event.locals.gebruiker = {
				...eigenaar,
				admin: isBeheerder(eigenaar.email, c.beheerders),
				toegestaan: true,
				demo: false
			};
		} else if (c.authActief && c.projectId) {
			const kop = event.request.headers.get('authorization') ?? '';
			const token = kop.startsWith('Bearer ') ? kop.slice(7) : '';
			const gebruiker = token ? await controleerIdToken(token, c.projectId) : null;
			if (!gebruiker) {
				const melding = pad === MCP_PAD ? 'Geef een MCP-sleutel mee in de Authorization-kop (Bearer bov_…).' : 'Je bent niet ingelogd.';
				return json({ fout: melding }, { status: 401, headers: pad === MCP_PAD ? UITDAGING : undefined });
			}
			const admin = isBeheerder(gebruiker.email, c.beheerders);
			const uitslag = await controleerAllowlist(gebruiker.email, c.serviceAccount, c.beheerders);
			const toegestaan = uitslag.toegestaan;
			event.locals.gebruiker = { ...gebruiker, admin, toegestaan, demo: false, toegangsFout: uitslag.fout };
			// Zonder toegang alleen: wie ben ik, en een uitnodiging inwisselen
			if (!toegestaan && pad !== '/api/ik' && pad !== '/api/uitnodiging') {
				return json({ fout: 'Geen toegang: je e-mailadres staat niet op de uitnodigingslijst.' }, { status: 403 });
			}
		} else if (c.demoToegestaan) {
			event.locals.gebruiker = { uid: 'demo', email: 'demo@lokaal', admin: true, toegestaan: true, demo: true };
		} else {
			return json(
				{ fout: 'De app is nog niet ingesteld: Firebase-configuratie ontbreekt (of zet DEMO_MODUS=1).' },
				{ status: 503 }
			);
		}
	}

	const antwoord = await resolve(event);
	antwoord.headers.set('x-content-type-options', 'nosniff');
	antwoord.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	if (pad.startsWith('/api/') && !antwoord.headers.has('cache-control')) antwoord.headers.set('cache-control', 'no-store');
	return antwoord;
};
