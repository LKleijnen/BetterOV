import { json, text } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { Firestore } from '$lib/server/firestore';
import { behandelPayload, FOUT, MCP_VERSIE } from '$lib/server/mcp/protocol';
import { GEREEDSCHAPPEN, McpContext, SERVER } from '$lib/server/mcp/gereedschap';
import type { RequestHandler } from './$types';

// MCP-endpoint ("Streamable HTTP", zonder sessies): hier praat een AI-assistent met BetterOV.
// Inloggen gaat met een MCP-sleutel in de Authorization-kop; dat regelt hooks.server.ts.
// Uitleg en het maken van sleutels: /mcp in de app.

const KOPPEN = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept, last-event-id',
	'access-control-max-age': '86400'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const g = locals.gebruiker;
	if (!g) return json({ fout: 'Je bent niet ingelogd.' }, { status: 401, headers: KOPPEN });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ jsonrpc: '2.0', id: null, error: { code: FOUT.parse, message: 'Ongeldige JSON.' } }, { status: 400, headers: KOPPEN });
	}
	const c = config();
	const ctx = new McpContext({
		nsKey: c.nsKey,
		mock: c.mock,
		fs: c.serviceAccount ? new Firestore(c.serviceAccount) : null,
		gebruiker: { uid: g.uid, email: g.email, naam: g.naam }
	});
	const antwoord = await behandelPayload(body, { server: SERVER, gereedschappen: GEREEDSCHAPPEN }, ctx);
	// Alleen meldingen: volgens de MCP-specificatie 202 zonder inhoud
	if (antwoord === null) return text('', { status: 202, headers: KOPPEN });
	return json(antwoord, { headers: KOPPEN });
};

/** Wij sturen niks van onszelf, dus geen SSE-stroom; een browser krijgt wel uitleg */
export const GET: RequestHandler = async () => {
	return json(
		{
			server: SERVER.titel,
			protocolVersion: MCP_VERSIE,
			gereedschappen: GEREEDSCHAPPEN.map((g) => g.naam),
			uitleg: 'Dit is het MCP-endpoint van BetterOV. Stuur JSON-RPC-berichten met POST en een MCP-sleutel in de Authorization-kop. Maak een sleutel in de app onder Meer → AI-assistent.'
		},
		{ status: 405, headers: { ...KOPPEN, allow: 'POST, DELETE, OPTIONS' } }
	);
};

/** Sessie afsluiten: we houden geen sessie bij, dus altijd goed */
export const DELETE: RequestHandler = async () => text('', { status: 204, headers: KOPPEN });

export const OPTIONS: RequestHandler = async () => text('', { status: 204, headers: KOPPEN });
