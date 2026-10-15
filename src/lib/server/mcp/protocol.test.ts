import { describe, expect, it } from 'vitest';
import { behandelBericht, behandelPayload, BEKENDE_VERSIES, FOUT, MCP_VERSIE, type Behandelaar, type Gereedschap } from './protocol';

const echo: Gereedschap<{ naam: string }> = {
	naam: 'echo',
	titel: 'Echo',
	omschrijving: 'Geeft terug wat je stuurt',
	schema: { type: 'object', properties: { tekst: { type: 'string' } }, required: ['tekst'] },
	async uitvoer(a, ctx) {
		return { tekst: `${ctx.naam}: ${a.tekst}`, data: { tekst: a.tekst } };
	}
};

const stuk: Gereedschap<{ naam: string }> = {
	naam: 'stuk',
	titel: 'Stuk',
	omschrijving: 'Gaat altijd mis',
	schema: { type: 'object', properties: {} },
	alleenLezen: false,
	async uitvoer() {
		throw new Error('NS reageerde niet');
	}
};

const behandelaar: Behandelaar<{ naam: string }> = {
	server: { naam: 'betterov', titel: 'BetterOV', versie: '1.0.0', instructies: 'Uitleg' },
	gereedschappen: [echo, stuk]
};
const ctx = { naam: 'Lars' };

const roep = (bericht: unknown) => behandelBericht(bericht as never, behandelaar, ctx);

describe('MCP-protocol', () => {
	it('antwoordt op initialize met de gevraagde versie en de gereedschapscapaciteit', async () => {
		const a = await roep({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
		expect(a?.result).toMatchObject({
			protocolVersion: '2025-03-26',
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: 'betterov', version: '1.0.0' }
		});
	});

	it('valt bij een onbekende of nieuwere versie terug op een versie die we echt doen', async () => {
		for (const gevraagd of ['gisteren', '2026-07-28']) {
			const a = await roep({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: gevraagd } });
			expect((a?.result as { protocolVersion: string }).protocolVersion).toBe(MCP_VERSIE);
		}
		// We beweren geen versie te spreken waarvan we de handdruk niet hebben
		expect(BEKENDE_VERSIES).not.toContain('2026-07-28');
	});

	it('antwoordt ook op server/discover, voor clients zonder initialize', async () => {
		const a = await roep({ jsonrpc: '2.0', id: 9, method: 'server/discover' });
		expect(a?.result).toMatchObject({ serverInfo: { name: 'betterov' }, capabilities: { tools: { listChanged: false } } });
		expect((a?.result as { protocolVersions: string[] }).protocolVersions).toContain(MCP_VERSIE);
	});

	it('werkt ook zonder initialize (geen sessie nodig)', async () => {
		const a = await roep({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'echo', arguments: { tekst: 'hoi' } } });
		expect(a?.result).toMatchObject({ content: [{ type: 'text', text: 'Lars: hoi' }], isError: false });
	});

	it('somt de gereedschappen op met een JSON-schema', async () => {
		const a = await roep({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
		const lijst = (a?.result as { tools: { name: string; inputSchema: { required?: string[] }; annotations: { readOnlyHint: boolean } }[] }).tools;
		expect(lijst.map((t) => t.name)).toEqual(['echo', 'stuk']);
		expect(lijst[0].inputSchema.required).toEqual(['tekst']);
		expect(lijst[0].annotations.readOnlyHint).toBe(true);
		expect(lijst[1].annotations.readOnlyHint).toBe(false);
	});

	it('geeft een fout in een gereedschap terug als resultaat, niet als protocolfout', async () => {
		const a = await roep({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'stuk' } });
		expect(a?.error).toBeUndefined();
		expect(a?.result).toMatchObject({ isError: true });
		expect((a?.result as { content: { text: string }[] }).content[0].text).toContain('NS reageerde niet');
	});

	it('weigert een onbekend gereedschap en een onbekende methode', async () => {
		expect((await roep({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'bestaat-niet' } }))?.error?.code).toBe(
			FOUT.ongeldigeParameters
		);
		expect((await roep({ jsonrpc: '2.0', id: 5, method: 'kofschip' }))?.error?.code).toBe(FOUT.onbekendeMethode);
		expect((await roep({ jsonrpc: '2.0', id: 6 }))?.error?.code).toBe(FOUT.ongeldigVerzoek);
	});

	it('antwoordt niet op meldingen', async () => {
		expect(await roep({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
		expect(await roep({ jsonrpc: '2.0', id: null, method: 'notifications/cancelled' })).toBeNull();
	});

	it('kent ping en lege lijsten voor resources en prompts', async () => {
		expect((await roep({ jsonrpc: '2.0', id: 1, method: 'ping' }))?.result).toEqual({});
		expect((await roep({ jsonrpc: '2.0', id: 1, method: 'resources/list' }))?.result).toEqual({ resources: [] });
		expect((await roep({ jsonrpc: '2.0', id: 1, method: 'prompts/list' }))?.result).toEqual({ prompts: [] });
	});

	it('behandelt een rijtje berichten en laat meldingen daarin weg', async () => {
		const a = await behandelPayload(
			[
				{ jsonrpc: '2.0', method: 'notifications/initialized' },
				{ jsonrpc: '2.0', id: 1, method: 'ping' },
				{ jsonrpc: '2.0', id: 2, method: 'tools/list' }
			],
			behandelaar,
			ctx
		);
		expect(Array.isArray(a) && a.map((x) => x.id)).toEqual([1, 2]);
	});

	it('geeft null als er alleen meldingen zijn, en een fout bij onzin', async () => {
		expect(await behandelPayload([{ jsonrpc: '2.0', method: 'notifications/initialized' }], behandelaar, ctx)).toBeNull();
		expect(((await behandelPayload('hoi', behandelaar, ctx)) as { error: { code: number } }).error.code).toBe(FOUT.ongeldigVerzoek);
	});
});
