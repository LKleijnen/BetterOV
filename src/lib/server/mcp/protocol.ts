// Model Context Protocol (MCP) over HTTP: JSON-RPC 2.0 heen en weer, zonder extra pakketten.
// Opzet zonder sessies ("stateless"): elke aanroep staat los, dus zowel de versies met als de
// versies zonder de initialize-handdruk werken. De gereedschappen zelf staan in gereedschap.ts.

export const MCP_VERSIE = '2025-06-18';

/** Versies die we kennen; vraagt een client er een van, dan antwoorden we met diezelfde versie */
export const BEKENDE_VERSIES = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'];

export interface JsonRpcBericht {
	jsonrpc?: unknown;
	id?: string | number | null;
	method?: unknown;
	params?: unknown;
}

export interface JsonRpcAntwoord {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export const FOUT = {
	parse: -32700,
	ongeldigVerzoek: -32600,
	onbekendeMethode: -32601,
	ongeldigeParameters: -32602,
	intern: -32603
} as const;

/** Wat een gereedschap teruggeeft: tekst voor de AI, en dezelfde gegevens als JSON */
export interface Uitkomst {
	tekst: string;
	data?: unknown;
	/** De aanroep lukte niet; de AI leest de tekst als foutmelding */
	fout?: boolean;
}

export interface JsonSchema {
	type: 'object';
	properties: Record<string, unknown>;
	required?: string[];
}

export interface Gereedschap<C> {
	naam: string;
	titel: string;
	omschrijving: string;
	schema: JsonSchema;
	/** Verandert niets (alleen opvragen); de assistent hoeft dan niets te bevestigen */
	alleenLezen?: boolean;
	uitvoer: (argumenten: Record<string, unknown>, ctx: C) => Promise<Uitkomst>;
}

export interface ServerGegevens {
	naam: string;
	titel: string;
	versie: string;
	/** Uitleg voor de assistent over wat deze server is en hoe hij hem gebruikt */
	instructies?: string;
}

function antwoord(id: string | number | null, result: unknown): JsonRpcAntwoord {
	return { jsonrpc: '2.0', id, result };
}

function fout(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcAntwoord {
	return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function kiesVersie(gevraagd: unknown): string {
	return typeof gevraagd === 'string' && BEKENDE_VERSIES.includes(gevraagd) ? gevraagd : MCP_VERSIE;
}

function naarGereedschapslijst<C>(lijst: Gereedschap<C>[]) {
	return lijst.map((g) => ({
		name: g.naam,
		title: g.titel,
		description: g.omschrijving,
		inputSchema: { ...g.schema, additionalProperties: false },
		annotations: {
			title: g.titel,
			readOnlyHint: g.alleenLezen !== false,
			destructiveHint: false,
			openWorldHint: true
		}
	}));
}

export interface Behandelaar<C> {
	server: ServerGegevens;
	gereedschappen: Gereedschap<C>[];
}

/**
 * Behandelt één JSON-RPC-bericht. Geeft null terug bij een melding (notification): daar hoort
 * volgens JSON-RPC geen antwoord bij.
 */
export async function behandelBericht<C>(
	bericht: JsonRpcBericht,
	{ server, gereedschappen }: Behandelaar<C>,
	ctx: C
): Promise<JsonRpcAntwoord | null> {
	const methode = typeof bericht?.method === 'string' ? bericht.method : null;
	const melding = bericht?.id === undefined || bericht?.id === null;
	const id = melding ? null : bericht.id!;
	if (!methode) return melding ? null : fout(id, FOUT.ongeldigVerzoek, 'method ontbreekt.');
	// Meldingen (notifications/initialized, notifications/cancelled, …) hoeven geen antwoord
	if (melding) return null;
	const params = (bericht.params ?? {}) as Record<string, unknown>;

	switch (methode) {
		case 'initialize':
			return antwoord(id, {
				protocolVersion: kiesVersie(params.protocolVersion),
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: server.naam, title: server.titel, version: server.versie },
				instructions: server.instructies
			});
		case 'ping':
			return antwoord(id, {});
		case 'tools/list':
			return antwoord(id, { tools: naarGereedschapslijst(gereedschappen) });
		case 'tools/call': {
			const naam = params.name;
			const gereedschap = gereedschappen.find((g) => g.naam === naam);
			if (typeof naam !== 'string' || !gereedschap) {
				return fout(id, FOUT.ongeldigeParameters, `Onbekend gereedschap: ${String(naam)}`);
			}
			const argumenten = (params.arguments ?? {}) as Record<string, unknown>;
			if (typeof argumenten !== 'object' || Array.isArray(argumenten)) {
				return fout(id, FOUT.ongeldigeParameters, 'arguments moet een object zijn.');
			}
			let uit: Uitkomst;
			try {
				uit = await gereedschap.uitvoer(argumenten, ctx);
			} catch (e) {
				// Een fout in het gereedschap zelf hoort in het resultaat, niet in de JSON-RPC-fout:
				// dan kan de assistent het uitleggen of iets anders proberen
				uit = { tekst: `Dit lukte niet: ${(e as Error).message || 'onbekende fout'}`, fout: true };
			}
			return antwoord(id, {
				content: [{ type: 'text', text: uit.tekst }],
				// structuredContent moet een object zijn, dus een lijst gaat onder "resultaat"
				...(uit.data === undefined ? {} : { structuredContent: { resultaat: uit.data } }),
				isError: !!uit.fout
			});
		}
		// We bieden geen resources en prompts aan, maar sommige clients vragen het toch
		case 'resources/list':
			return antwoord(id, { resources: [] });
		case 'resources/templates/list':
			return antwoord(id, { resourceTemplates: [] });
		case 'prompts/list':
			return antwoord(id, { prompts: [] });
		case 'logging/setLevel':
			return antwoord(id, {});
		default:
			return fout(id, FOUT.onbekendeMethode, `Onbekende methode: ${methode}`);
	}
}

/**
 * Behandelt een hele HTTP-body: één bericht of een rijtje (batch). Geeft null als er niets te
 * antwoorden is (alleen meldingen), zodat de route dan 202 Accepted kan sturen.
 */
export async function behandelPayload<C>(
	body: unknown,
	behandelaar: Behandelaar<C>,
	ctx: C
): Promise<JsonRpcAntwoord | JsonRpcAntwoord[] | null> {
	if (Array.isArray(body)) {
		if (body.length === 0) return fout(null, FOUT.ongeldigVerzoek, 'Leeg verzoek.');
		const antwoorden: JsonRpcAntwoord[] = [];
		for (const b of body) {
			const a = await behandelBericht(b as JsonRpcBericht, behandelaar, ctx);
			if (a) antwoorden.push(a);
		}
		return antwoorden.length ? antwoorden : null;
	}
	if (!body || typeof body !== 'object') return fout(null, FOUT.ongeldigVerzoek, 'Geen JSON-RPC-bericht.');
	return behandelBericht(body as JsonRpcBericht, behandelaar, ctx);
}
