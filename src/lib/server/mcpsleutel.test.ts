import { describe, expect, it } from 'vitest';
import type { FsDocument } from './firestore';
import {
	eigenaarVanSleutel,
	geldigeSleutel,
	isMcpPad,
	lijstSleutels,
	maakSleutel,
	sleutelHash,
	sleutelUitVerzoek,
	trekSleutelIn
} from './mcpsleutel';

/** Firestore in het geheugen, met een eenvoudige zoekopdracht op één veld */
function nepOpslag() {
	const docs = new Map<string, Record<string, unknown>>();
	return {
		docs,
		async get<T>(pad: string): Promise<FsDocument<T> | null> {
			const d = docs.get(pad);
			return d ? { id: pad.split('/').pop()!, pad, data: structuredClone(d) as T, updateTime: 't1' } : null;
		},
		async zet(pad: string, data: Record<string, unknown>, velden?: string[]) {
			const oud = docs.get(pad);
			docs.set(pad, velden ? { ...(oud ?? {}), ...Object.fromEntries(velden.map((v) => [v, data[v]])) } : data);
		},
		async zoek<T>(collectie: string, veld: string, _op: string, waarde: unknown): Promise<FsDocument<T>[]> {
			return [...docs.entries()]
				.filter(([p, d]) => p.startsWith(`${collectie}/`) && d[veld] === waarde)
				.map(([pad, d]) => ({ id: pad.split('/').pop()!, pad, data: d as T }));
		},
		async verwijder(pad: string) {
			docs.delete(pad);
		}
	} as const;
}

const LARS = { uid: 'u1', email: 'kleijnenlars@gmail.com' };

describe('MCP-sleutels', () => {
	it('bewaart alleen een hash, niet de sleutel zelf', async () => {
		const fs = nepOpslag();
		const { sleutel, id } = await maakSleutel(fs, LARS, 'Claude op mijn laptop');
		expect(sleutel).toMatch(/^bov_[A-Za-z0-9_-]{32}$/);
		expect(id).toBe(await sleutelHash(sleutel));
		expect([...fs.docs.keys()]).toEqual([`mcpSleutels/${id}`]);
		expect(JSON.stringify([...fs.docs.values()])).not.toContain(sleutel.slice(4));
	});

	it('herkent de eigenaar van een geldige sleutel en niemand bij een verzonnen sleutel', async () => {
		const fs = nepOpslag();
		const { sleutel } = await maakSleutel(fs, LARS);
		expect(await eigenaarVanSleutel(fs, sleutel)).toEqual({ uid: 'u1', email: LARS.email, naam: undefined });
		expect(await eigenaarVanSleutel(fs, 'bov_dezeverzinikzelfmaarisnietecht12')).toBeNull();
		expect(await eigenaarVanSleutel(fs, 'onzin')).toBeNull();
	});

	it('houdt bij wanneer een sleutel voor het laatst is gebruikt, zonder elke keer te schrijven', async () => {
		const fs = nepOpslag();
		const { sleutel, id } = await maakSleutel(fs, LARS);
		const nu = Date.parse('2026-10-16T09:00:00Z');
		const laatstGebruikt = () => fs.docs.get(`mcpSleutels/${id}`)?.laatstGebruiktOp;
		await eigenaarVanSleutel(fs, sleutel, nu);
		expect(laatstGebruikt()).toBe('2026-10-16T09:00:00.000Z');
		// Binnen het uur niet opnieuw schrijven
		await eigenaarVanSleutel(fs, sleutel, nu + 600_000);
		expect(laatstGebruikt()).toBe('2026-10-16T09:00:00.000Z');
		await eigenaarVanSleutel(fs, sleutel, nu + 2 * 3600_000);
		expect(laatstGebruikt()).toBe('2026-10-16T11:00:00.000Z');
	});

	it('laat je alleen je eigen sleutels zien en intrekken', async () => {
		const fs = nepOpslag();
		const mijn = await maakSleutel(fs, LARS, 'Laptop');
		const andermans = await maakSleutel(fs, { uid: 'u2', email: 'iemand@gmail.com' }, 'Telefoon');
		expect((await lijstSleutels(fs, 'u1')).map((d) => d.data.naam)).toEqual(['Laptop']);
		await expect(trekSleutelIn(fs, 'u1', andermans.id)).rejects.toThrow(/bestaat niet/);
		expect(fs.docs.has(`mcpSleutels/${andermans.id}`)).toBe(true);
		await trekSleutelIn(fs, 'u1', mijn.id);
		expect(await eigenaarVanSleutel(fs, mijn.sleutel)).toBeNull();
	});

	describe('waar een sleutel mag staan', () => {
		const koppen = (x: Record<string, string> = {}) => ({ get: (n: string) => x[n] ?? null });
		const SLEUTEL = 'bov_abcdefghijklmnopqrstuvwxyz12345';

		it('leest de sleutel uit de Authorization-kop, x-mcp-sleutel of het pad', () => {
			expect(sleutelUitVerzoek('/api/mcp', koppen({ authorization: `Bearer ${SLEUTEL}` }))).toBe(SLEUTEL);
			expect(sleutelUitVerzoek('/api/mcp', koppen({ 'x-mcp-sleutel': SLEUTEL }))).toBe(SLEUTEL);
			// Voor clients die geen eigen kop kunnen sturen: de sleutel achter het pad
			expect(sleutelUitVerzoek(`/api/mcp/${SLEUTEL}`, koppen())).toBe(SLEUTEL);
			expect(sleutelUitVerzoek(`/api/mcp/${SLEUTEL}/`, koppen())).toBe(SLEUTEL);
		});

		it('leest hem niet uit de querystring (verboden door de MCP-specificatie)', () => {
			expect(sleutelUitVerzoek('/api/mcp', koppen())).toBeNull();
			// De querystring zit niet in het pad, dus ook via die weg komt er niets binnen
			expect(sleutelUitVerzoek('/api/mcp', koppen({ authorization: 'Bearer onzin' }))).toBeNull();
			expect(sleutelUitVerzoek('/api/mcp/geen-geldige-sleutel', koppen())).toBeNull();
		});

		it('ziet alleen het MCP-endpoint als MCP-pad, niet het sleutelbeheer', () => {
			expect(isMcpPad('/api/mcp')).toBe(true);
			expect(isMcpPad(`/api/mcp/${SLEUTEL}`)).toBe(true);
			// Hier mag een MCP-sleutel juist NIET gelden: dit beheert sleutels en vraagt om een echte login
			expect(isMcpPad('/api/mcp-sleutels')).toBe(false);
			expect(isMcpPad('/api/plan')).toBe(false);
		});
	});

	it('keurt alleen sleutels met het juiste voorvoegsel en lengte goed', () => {
		expect(geldigeSleutel('bov_abcdefghijklmnopqrstuvwxyz12345')).toBe(true);
		expect(geldigeSleutel('bov_kort')).toBe(false);
		expect(geldigeSleutel('eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.xx.yy')).toBe(false);
		expect(geldigeSleutel(undefined)).toBe(false);
	});
});
