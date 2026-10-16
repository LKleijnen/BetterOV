import { describe, expect, it } from 'vitest';
import type { NsRitHalte } from './ns';
import { bepaalSplitsing, berekenInstapadvies, ritPad } from './trein';
import { alleSoorten, materieelSoort, bakkenUitType } from '../materieel';
import { heeftVoertuiginfo } from '../voertuig';
import { ovLeg } from '../testdata';

const halte = (naam: string, nummers: string[]): NsRitHalte => ({
	naam,
	lat: 52,
	lon: 5,
	materieel: { aantalDelen: nummers.length, delen: nummers.map((nummer) => ({ nummer, faciliteiten: [] })) }
});

describe('splitsen', () => {
	const delen = [
		{ nummer: '9401', faciliteiten: [], bakken: 6, eindbestemming: 'Den Haag Centraal' },
		{ nummer: '8702', faciliteiten: [], bakken: 4, eindbestemming: 'Rotterdam Centraal' }
	];
	const rit = [
		halte('Amsterdam Centraal', ['9401', '8702']),
		halte('Schiphol Airport', ['9401', '8702']),
		halte('Leiden Centraal', ['9401', '8702']),
		halte('Den Haag Centraal', ['9401'])
	];

	it('vindt het station en jouw deel via de ritdata', () => {
		const s = bepaalSplitsing(delen, [...rit.slice(0, 3), halte('Rotterdam Centraal', ['8702'])], {
			stationNaam: 'Amsterdam Centraal',
			naar: 'Rotterdam Centraal'
		});
		expect(s).toEqual({
			station: 'Rotterdam Centraal',
			jouwDelen: [1],
			bestemmingen: [
				{ deel: 0, naar: 'Den Haag Centraal' },
				{ deel: 1, naar: 'Rotterdam Centraal' }
			],
			voorUitstappen: true
		});
	});

	it('zegt dat het niet uitmaakt als je vóór de splitsing uitstapt', () => {
		const s = bepaalSplitsing(delen, rit, { stationNaam: 'Amsterdam Centraal', naar: 'Schiphol Airport', richting: 'Den Haag Centraal' });
		expect(s?.voorUitstappen).toBe(false);
		expect(s?.station).toBe('Den Haag Centraal');
	});

	it('geeft niets als alle delen naar dezelfde bestemming gaan', () => {
		expect(bepaalSplitsing([{ ...delen[0] }, { ...delen[1], eindbestemming: 'Den Haag Centraal' }], rit, {})).toBeUndefined();
	});
});

describe('splitsen zonder eindbestemming per treinstel (alleen ritdata)', () => {
	// Treinstellen zonder bestemming, zoals uit de ritdata van NS
	const delen = [
		{ nummer: '9501', faciliteiten: [], bakken: 0 },
		{ nummer: '9502', faciliteiten: [], bakken: 0 }
	];
	const tak = (id: string, naam: string, volgende: string[], nummers: string[], extra: Partial<NsRitHalte> = {}): NsRitHalte => ({
		...halte(naam, nummers),
		id,
		volgende,
		...extra
	});

	it('volgt de takken als NS beide takken geeft (meerdere volgende haltes)', () => {
		const rit = [
			tak('UT_0', 'Utrecht Centraal', ['EHV_0'], ['9501', '9502']),
			tak('EHV_0', 'Eindhoven Centraal', ['STD_0'], ['9501', '9502']),
			tak('STD_0', 'Sittard', ['MT_0', 'HRL_0'], ['9501', '9502']),
			tak('MT_0', 'Maastricht', [], ['9501']),
			tak('HRL_0', 'Heerlen', [], ['9502'])
		];
		expect(ritPad(rit, { naar: 'Heerlen' }).map((h) => h.naam)).toEqual(['Utrecht Centraal', 'Eindhoven Centraal', 'Sittard', 'Heerlen']);
		const s = bepaalSplitsing(delen, rit, { stationNaam: 'Utrecht Centraal', naar: 'Maastricht' });
		expect(s).toMatchObject({
			station: 'Sittard',
			jouwDelen: [0],
			jouwBestemming: 'Maastricht',
			andereBestemmingen: ['Heerlen'],
			voorUitstappen: true,
			bestemmingen: [
				{ deel: 0, naar: 'Maastricht' },
				{ deel: 1, naar: 'Heerlen' }
			]
		});
	});

	it('herkent meerdere vertrekken met een eigen bestemming', () => {
		const rit = [
			halte('Utrecht Centraal', ['9501', '9502']),
			{
				...halte('Sittard', ['9501', '9502']),
				vertrekken: [
					{ naar: 'Maastricht', nummers: ['9501'] },
					{ naar: 'Heerlen', nummers: ['9502'] }
				]
			},
			halte('Maastricht', ['9501'])
		];
		const s = bepaalSplitsing(delen, rit, { stationNaam: 'Utrecht Centraal', naar: 'Maastricht' });
		expect(s?.station).toBe('Sittard');
		expect(s?.jouwDelen).toEqual([0]);
		expect(s?.andereBestemmingen).toEqual(['Heerlen']);
	});

	it('waarschuwt ook als alleen het aantal treinstellen afneemt', () => {
		const rit = [halte('Utrecht Centraal', ['9501', '9502']), halte('Sittard', ['9501']), halte('Maastricht', ['9501'])];
		// Zonder treinstelnummers in de samenstelling weten we niet welk deel van jou is
		const s = bepaalSplitsing([{ faciliteiten: [], bakken: 4 }, { faciliteiten: [], bakken: 4 }], rit, { stationNaam: 'Utrecht Centraal', naar: 'Maastricht' });
		expect(s).toMatchObject({ station: 'Sittard', jouwDelen: [], jouwBestemming: 'Maastricht', voorUitstappen: true });
	});

	it('zegt niets als je vóór de splitsing uitstapt', () => {
		const rit = [
			tak('UT_0', 'Utrecht Centraal', ['STD_0'], ['9501', '9502']),
			tak('STD_0', 'Sittard', ['MT_0', 'HRL_0'], ['9501', '9502']),
			tak('MT_0', 'Maastricht', [], ['9501']),
			tak('HRL_0', 'Heerlen', [], ['9502'])
		];
		expect(bepaalSplitsing(delen, rit, { stationNaam: 'Utrecht Centraal', naar: 'Sittard' })?.voorUitstappen).toBe(false);
	});

	it('zegt niets over jouw deel als niet duidelijk is welke tak de jouwe is', () => {
		const rit = [
			tak('UT_0', 'Utrecht Centraal', ['STD_0'], ['9501', '9502']),
			tak('STD_0', 'Sittard', ['MT_0', 'HRL_0'], ['9501', '9502']),
			tak('MT_0', 'Maastricht', [], ['9501']),
			tak('HRL_0', 'Heerlen', [], ['9502'])
		];
		const s = bepaalSplitsing(delen, rit, { stationNaam: 'Utrecht Centraal', naar: 'Valkenburg', richting: 'Onbekend' });
		expect(s).toEqual({ station: 'Sittard', jouwDelen: [], bestemmingen: [], voorUitstappen: true });
	});

	it('geeft niets bij een gewone rit', () => {
		const rit = [halte('Utrecht Centraal', ['9501', '9502']), halte('Sittard', ['9501', '9502']), halte('Maastricht', ['9501', '9502'])];
		expect(bepaalSplitsing(delen, rit, { stationNaam: 'Utrecht Centraal', naar: 'Maastricht' })).toBeUndefined();
	});
});

describe('drukte in het instapadvies', () => {
	it('noemt waar het druk en waar het rustiger is', () => {
		const advies = berekenInstapadvies({
			ritnummer: '1',
			delen: [
				{
					faciliteiten: [],
					bakken: 3,
					indeling: [
						{ eersteKlas: false, stilte: false, drukte: 'hoog' },
						{ eersteKlas: true, stilte: false, drukte: 'gemiddeld' },
						{ eersteKlas: false, stilte: false, drukte: 'laag' }
					]
				}
			],
			ingekort: false,
			rijrichting: 'links',
			eersteKlasPerDeel: [true],
			ruw: null
		});
		expect(advies?.samenvatting).toContain('Waarschijnlijk het drukst: voorin');
		expect(advies?.samenvatting).toContain('Rustiger: achterin');
	});
});

describe('materieel', () => {
	it('herkent treintypes', () => {
		expect(materieelSoort('VIRM-6')?.code).toBe('VIRM');
		expect(materieelSoort('ICNG-B')?.leeftijd).toBe('nieuw');
		expect(materieelSoort('ICM-4')?.code).toBe('ICM');
		expect(materieelSoort('SNG 4')?.code).toBe('SNG');
		expect(materieelSoort('onbekend')).toBeUndefined();
		expect(bakkenUitType('VIRM-6')).toBe(6);
	});

	it('herkent ook regionale en internationale treinen', () => {
		expect(materieelSoort('FLIRT 3 FFF')?.code).toBe('FLIRT');
		expect(materieelSoort('Arriva GTW 2/8')?.code).toBe('GTW');
		expect(materieelSoort('Spurt')?.code).toBe('GTW');
		expect(materieelSoort('VIRMm1')?.code).toBe('VIRM');
		expect(materieelSoort('Eurostar e320')?.code).toBe('E320');
		expect(materieelSoort('Thalys')?.code).toBe('PBKA');
		expect(materieelSoort('ICE International')?.code).toBe('ICE');
		expect(materieelSoort('European Sleeper')?.code).toBe('EUROPEANSLEEPER');
		expect(materieelSoort('Nightjet')?.code).toBe('NIGHTJET');
	});

	it('verwart productnamen van NS niet met een treintype', () => {
		for (const naam of ['Intercity', 'Intercity direct', 'IC', 'Sprinter', 'SPR', 'Stoptrein', 'Sneltrein', 'Eurocity', 'EC', 'R-net', 'Blauwnet']) {
			expect(materieelSoort(naam), naam).toBeUndefined();
		}
	});

	it('elk type is met zijn eigen code terug te vinden', () => {
		const codes = new Set<string>();
		for (const s of alleSoorten()) {
			expect(s.code).toMatch(/^[A-Z0-9]+$/);
			expect(codes.has(s.code)).toBe(false);
			codes.add(s.code);
			expect(s.naam && s.omschrijving).toBeTruthy();
			// Een eerder type mag een later type niet 'opeten' (volgorde in SOORTEN)
			for (const c of [s.code, ...(s.ook ?? [])]) expect(materieelSoort(c)?.code, c).toBe(s.code);
		}
	});

	it('toont de knop Voertuiginfo alleen als er iets te zien is', () => {
		expect(heeftVoertuiginfo(ovLeg('A', 'B', '10:00', '10:30'))).toBe(true);
		expect(heeftVoertuiginfo(ovLeg('A', 'B', '10:00', '10:30', { modus: 'bus', ritnummer: undefined }))).toBe(false);
		expect(heeftVoertuiginfo(ovLeg('A', 'B', '10:00', '10:30', { modus: 'bus', ritnummer: undefined, rolstoel: true }))).toBe(true);
	});
});

describe('splitsen: minder treinstellen na een station, verder geen treinstellen bekend', () => {
	// Zoals IC 2769 Enkhuizen – Maastricht: in Eindhoven gaat alleen 9469 verder, daarna geeft NS geen treinstellen meer
	const delen = [
		{ nummer: '9469', faciliteiten: [], bakken: 4 },
		{ nummer: '9528', faciliteiten: [], bakken: 4 }
	];
	const stop = (naam: string, nummers: string[] | null): NsRitHalte => ({
		naam,
		lat: 52,
		lon: 5,
		status: 'STOP',
		bestemming: 'Maastricht / Heerlen',
		vertrekken: [{ naar: 'Maastricht', ritnummer: '2769', nummers: nummers ?? [] }],
		materieel: nummers ? { aantalDelen: nummers.length * 4, delen: nummers.map((nummer) => ({ nummer, faciliteiten: [] })) } : undefined
	});
	const rit = [
		stop("'s-Hertogenbosch", ['9469', '9528']),
		stop('Eindhoven Centraal', ['9469']),
		stop('Weert', null),
		stop('Roermond', null),
		{ ...stop('Maastricht', null), bestemming: 'Maastricht', vertrekken: undefined }
	];

	it('weet welk treinstel naar jouw station gaat, maar raadt niet waar de rest heen gaat', () => {
		const s = bepaalSplitsing(delen, rit, { stationNaam: "'s-Hertogenbosch", naar: 'Roermond', ritnummer: '2769' });
		expect(s).toEqual({
			station: 'Eindhoven Centraal',
			jouwDelen: [0],
			bestemmingen: [{ deel: 0, naar: 'Maastricht' }],
			jouwBestemming: 'Maastricht',
			voorUitstappen: true,
			alleenKorter: true
		});
	});
});
