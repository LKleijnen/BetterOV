import { describe, expect, it } from 'vitest';
import type { FsDocument } from '../firestore';
import { GEREEDSCHAPPEN, McpContext, naarTijdstip, SERVER, type McpDiensten } from './gereedschap';
import { nlDatumTijd } from '../../tijd';

/** Firestore in het geheugen (zoals in uitnodiging.test.ts) */
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
		async lijst<T>(collectie: string): Promise<FsDocument<T>[]> {
			return [...docs.entries()]
				.filter(([p]) => p.startsWith(`${collectie}/`) && !p.slice(collectie.length + 1).includes('/'))
				.map(([pad, d]) => ({ id: pad.split('/').pop()!, pad, data: d as T }));
		},
		async verwijder(pad: string) {
			docs.delete(pad);
		}
	};
}

const NU = nlDatumTijd('2026-10-16', '09:00').getTime();

function maakContext(extra: Partial<McpDiensten> = {}) {
	const fs = nepOpslag();
	const ctx = new McpContext({
		mock: true,
		fs,
		gebruiker: { uid: 'u1', email: 'lars@gmail.com', naam: 'Lars' },
		nu: NU,
		...extra
	});
	return { ctx, fs };
}

function roep(naam: string, argumenten: Record<string, unknown>, ctx: McpContext) {
	const g = GEREEDSCHAPPEN.find((x) => x.naam === naam);
	if (!g) throw new Error(`Onbekend gereedschap ${naam}`);
	return g.uitvoer(argumenten, ctx);
}

describe('MCP-gereedschap', () => {
	it('biedt de functies van de app aan, met uitleg voor de assistent', () => {
		expect(GEREEDSCHAPPEN.map((g) => g.naam)).toEqual([
			'plan_reis',
			'vertrektijden',
			'mijn_reis',
			'trein_info',
			'rit_haltes',
			'station_info',
			'voertuig_info',
			'zoek_plek',
			'laatste_trein_naar_huis',
			'mijn_gegevens',
			'start_reis',
			'stop_reis'
		]);
		// Alleen reizen starten en stoppen verandert iets
		expect(GEREEDSCHAPPEN.filter((g) => g.alleenLezen === false).map((g) => g.naam)).toEqual(['start_reis', 'stop_reis']);
		expect(SERVER.instructies).toContain('Europe/Amsterdam');
	});

	describe('tijden lezen', () => {
		it('begrijpt "nu", een tijd van vandaag en een volledige datum in Nederlandse tijd', () => {
			expect(naarTijdstip('nu', NU)).toBeUndefined();
			expect(naarTijdstip(undefined, NU)).toBeUndefined();
			// 09:30 Nederlandse zomertijd in oktober = 07:30 UTC
			expect(naarTijdstip('09:30', NU)).toBe('2026-10-16T07:30:00.000Z');
			expect(naarTijdstip('2026-12-24 18:05', NU)).toBe('2026-12-24T17:05:00.000Z');
			expect(naarTijdstip('2026-10-16T07:30:00.000Z', NU)).toBe('2026-10-16T07:30:00.000Z');
		});

		it('klaagt begrijpelijk over onzin', () => {
			expect(() => naarTijdstip('morgenmiddag', NU)).toThrow(/Onbegrijpelijke tijd/);
		});
	});

	it('plant een reis op plaatsnamen en zet de adviezen in leesbare tekst', async () => {
		const { ctx } = maakContext();
		const uit = await roep('plan_reis', { van: 'Utrecht Centraal', naar: 'Amsterdam Centraal', tijd: '09:30', aantal: 2 }, ctx);
		expect(uit.tekst).toContain('Reisadviezen Utrecht Centraal');
		expect(uit.tekst).toMatch(/\d{2}:\d{2} → \d{2}:\d{2}/);
		const data = uit.data as { adviezen: { legs: unknown[]; id: string }[] };
		expect(data.adviezen.length).toBeLessThanOrEqual(2);
		expect(data.adviezen[0].legs.length).toBeGreaterThan(0);
	});

	it('zoekt plekken en geeft het stopId mee', async () => {
		const { ctx } = maakContext();
		const uit = await roep('zoek_plek', { zoekterm: 'Utrecht' }, ctx);
		expect(uit.tekst).toContain('Utrecht Centraal');
		expect(uit.tekst).toContain('stopId');
	});

	it('geeft vertrektijden, niet meer dan gevraagd', async () => {
		const { ctx } = maakContext();
		const uit = await roep('vertrektijden', { halte: 'Utrecht Centraal', aantal: 3 }, ctx);
		expect(uit.tekst).toContain('Vertrektijden Utrecht Centraal');
		expect((uit.data as { vertrekken: unknown[] }).vertrekken).toHaveLength(3);
	});

	it('vertelt over de trein: type, bakken en instappen', async () => {
		const { ctx } = maakContext();
		const uit = await roep('trein_info', { ritnummer: '3052', station: 'Utrecht Centraal' }, ctx);
		expect(uit.tekst).toContain('Trein 3052');
		expect(uit.tekst).toMatch(/bakken/);
	});

	it('weigert een ritnummer dat geen nummer is', async () => {
		const { ctx } = maakContext();
		await expect(roep('trein_info', { ritnummer: 'IC naar Amsterdam' }, ctx)).rejects.toThrow(/ritnummer bestaat uit cijfers/);
	});

	it('geeft de haltes van een rit', async () => {
		const { ctx } = maakContext();
		const uit = await roep('rit_haltes', { ritnummer: '3052' }, ctx);
		expect(uit.tekst).toContain('Utrecht Centraal');
		expect((uit.data as { haltes: unknown[] }).haltes.length).toBeGreaterThan(1);
	});

	it('geeft stationsinformatie met voorzieningen', async () => {
		const { ctx } = maakContext();
		const uit = await roep('station_info', { station: 'Utrecht Centraal' }, ctx);
		expect(uit.tekst).toContain('Sporen:');
		expect(uit.tekst).toContain('Voorzieningen');
	});

	it('zoekt een voertuigtype op in de gids', async () => {
		const { ctx } = maakContext();
		const uit = await roep('voertuig_info', { zoekterm: 'VIRM' }, ctx);
		expect(uit.tekst).toContain('VIRM');
		expect(uit.tekst).toContain('Bronnen:');
	});

	it('vertelt dat er geen reis loopt als er geen actieve reis is', async () => {
		const { ctx } = maakContext();
		const uit = await roep('mijn_reis', {}, ctx);
		expect(uit.tekst).toContain('geen reis');
	});

	it('start een reis, bewaakt hem en rondt hem weer af', async () => {
		const { ctx, fs } = maakContext();
		await fs.zet('users/u1', { naam: 'Lars', thuislocatie: { naam: 'Oudegracht 100', lat: 52.0908, lon: 5.1198, type: 'adres' } });
		const start = await roep('start_reis', { van: 'Utrecht Centraal', naar: 'thuis' }, ctx);
		expect(start.tekst).toContain('wordt nu bewaakt');

		const pointer = fs.docs.get('actieveReizen/u1') as { uid: string; reisId: string; eindeOp: string; herinneringen: unknown };
		expect(pointer.uid).toBe('u1');
		expect(pointer.eindeOp).toBeTruthy();
		// De cron-worker leest de herinneringsinstellingen uit de kopie
		expect(pointer.herinneringen).toEqual({ instappen: [120], uitstappen: [120] });
		expect(fs.docs.get(`users/u1/reizen/${pointer.reisId}`)).toMatchObject({ status: 'actief' });

		// Een nieuwe context leest de reis terug (zoals bij een volgende vraag aan de assistent)
		const { ctx: ctx2 } = maakContext();
		const tweede = new McpContext({ ...ctx2.d, fs });
		const lopend = await roep('mijn_reis', {}, tweede);
		expect(lopend.tekst).toContain('Nu:');
		expect(lopend.tekst).toMatch(/Instappen|Uitstappen|Lopen|aangekomen/);

		const derde = new McpContext({ ...ctx2.d, fs });
		const stop = await roep('stop_reis', {}, derde);
		expect(stop.tekst).toContain('afgerond');
		expect(fs.docs.has('actieveReizen/u1')).toBe(false);
		expect(fs.docs.get(`users/u1/reizen/${pointer.reisId}`)).toMatchObject({ status: 'afgerond' });
	});

	it('start liever niets dan het verkeerde advies', async () => {
		const { ctx, fs } = maakContext();
		await expect(roep('start_reis', { van: 'Utrecht Centraal', naar: 'Zwolle', keuze: '99' }, ctx)).rejects.toThrow(/Plan nog een keer/);
		expect(fs.docs.has('actieveReizen/u1')).toBe(false);
	});

	it('start het advies dat bij het gevraagde nummer hoort', async () => {
		const { ctx, fs } = maakContext();
		const lijst = (await roep('plan_reis', { van: 'Utrecht Centraal', naar: 'Zwolle', tijd: '10:00' }, ctx)).data as {
			adviezen: { id: string }[];
		};
		await roep('start_reis', { van: 'Utrecht Centraal', naar: 'Zwolle', tijd: '10:00', keuze: '2' }, ctx);
		const pointer = fs.docs.get('actieveReizen/u1') as { advies: { id: string } };
		expect(pointer.advies.id).toBe(lijst.adviezen[1].id);
	});

	it('gebruikt je eigen plekken en thuislocatie als vertrekpunt', async () => {
		const { ctx, fs } = maakContext();
		await fs.zet('users/u1', { thuislocatie: { naam: 'Kerkstraat 12', lat: 52.1561, lon: 5.3878, type: 'adres' } });
		await fs.zet('users/u1/plekken/p1', { naam: 'Werk', plek: { naam: 'Damrak 1', lat: 52.3752, lon: 4.8966, type: 'adres' } });
		const uit = await roep('plan_reis', { van: 'Werk', naar: 'thuis', aantal: 1 }, ctx);
		expect(uit.tekst).toContain('Damrak 1');
		expect(uit.tekst).toContain('Kerkstraat 12');
	});

	it('somt je eigen gegevens op', async () => {
		const { ctx, fs } = maakContext();
		await fs.zet('users/u1', { naam: 'Lars', herinneringen: { instappen: [300], uitstappen: [] } });
		await fs.zet('users/u1/favorieten/f1', { naam: 'Naar oma', van: { naam: 'Utrecht Centraal', lat: 52.0894, lon: 5.1101 }, naar: { naam: 'Zwolle', lat: 52.5046, lon: 6.0911 }, voorkeur: 'snelst' });
		await fs.zet('users/u1/weekplanning/w1', { dagen: [1, 3], tijd: '08:15', soort: 'aankomst', van: { naam: 'Utrecht Centraal', lat: 52.0894, lon: 5.1101 }, naar: { naam: 'Amsterdam Centraal', lat: 52.3789, lon: 4.9003 } });
		const uit = await roep('mijn_gegevens', {}, ctx);
		expect(uit.tekst).toContain('Naar oma');
		expect(uit.tekst).toContain('ma/wo 08:15 aankomen');
		expect(uit.tekst).toContain('instappen 300 s vooraf, uitstappen uit');
		expect(uit.tekst).toContain('Thuislocatie: niet ingesteld');
	});

	it('legt uit dat persoonlijke gegevens niet bestaan in demo-modus', async () => {
		const { ctx } = maakContext({ fs: null });
		await expect(roep('mijn_reis', {}, ctx)).rejects.toThrow(/demo-modus/);
		// Plannen kan daar wél, zolang je geen "thuis" gebruikt
		const uit = await roep('plan_reis', { van: 'Utrecht Centraal', naar: 'Zwolle', aantal: 1 }, ctx);
		expect(uit.tekst).toContain('Reisadviezen');
		await expect(roep('plan_reis', { van: 'thuis', naar: 'Zwolle' }, ctx)).rejects.toThrow(/thuislocatie/);
	});

	it('zoekt de laatste reis naar huis', async () => {
		const { ctx, fs } = maakContext();
		await fs.zet('users/u1', { thuislocatie: { naam: 'Oudegracht 100', lat: 52.0908, lon: 5.1198, type: 'adres' } });
		const uit = await roep('laatste_trein_naar_huis', { van: 'Amsterdam Centraal' }, ctx);
		expect(uit.tekst).toContain('Laatste reis Amsterdam Centraal');
	});
});
