// De HTTP-kant van het MCP-endpoint, zodat /api/mcp en /api/mcp/<sleutel> precies hetzelfde doen.

import { json, text } from '@sveltejs/kit';
import { config } from '../config';
import { Firestore } from '../firestore';
import { behandelPayload, FOUT, MCP_VERSIE } from './protocol';
import { GEREEDSCHAPPEN, McpContext, SERVER } from './gereedschap';

/** Een MCP-client in de browser moet ook de foutmeldingen kunnen lezen */
export const MCP_KOPPEN = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept, last-event-id',
	'access-control-max-age': '86400'
};

export async function mcpPost(request: Request, gebruiker: App.Locals['gebruiker']): Promise<Response> {
	if (!gebruiker) return json({ fout: 'Je bent niet ingelogd.' }, { status: 401, headers: MCP_KOPPEN });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ jsonrpc: '2.0', id: null, error: { code: FOUT.parse, message: 'Ongeldige JSON.' } }, { status: 400, headers: MCP_KOPPEN });
	}
	const c = config();
	const ctx = new McpContext({
		nsKey: c.nsKey,
		mock: c.mock,
		fs: c.serviceAccount ? new Firestore(c.serviceAccount) : null,
		gebruiker: { uid: gebruiker.uid, email: gebruiker.email, naam: gebruiker.naam }
	});
	const antwoord = await behandelPayload(body, { server: SERVER, gereedschappen: GEREEDSCHAPPEN }, ctx);
	// Alleen meldingen: volgens de MCP-specificatie 202 zonder inhoud
	if (antwoord === null) return text('', { status: 202, headers: MCP_KOPPEN });
	return json(antwoord, { headers: MCP_KOPPEN });
}

/** Wij openen zelf geen stroom, dus geen SSE op GET; een browser krijgt wel uitleg */
export function mcpGet(): Response {
	return json(
		{
			server: SERVER.titel,
			protocolVersion: MCP_VERSIE,
			gereedschappen: GEREEDSCHAPPEN.map((g) => g.naam),
			uitleg:
				'Dit is het MCP-endpoint van BetterOV. Stuur JSON-RPC-berichten met POST en een MCP-sleutel in de Authorization-kop. Maak een sleutel in de app onder Meer → AI-assistent.'
		},
		{ status: 405, headers: { ...MCP_KOPPEN, allow: 'POST, DELETE, OPTIONS' } }
	);
}

export function mcpLeeg(): Response {
	return text('', { status: 204, headers: MCP_KOPPEN });
}
