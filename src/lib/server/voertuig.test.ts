import { describe, expect, it } from 'vitest';
import type { FsDocument } from './firestore';
import type { NsRitHalte } from './ns';
import type { TreinInfo } from '../types';
import { bepaalSplitsing, berekenInstapadvies } from './trein';
import { logRit, ritHistorie } from './materieel';
import { materieelSoort, bakkenUitType } from '../materieel';
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

	it('toont de knop Voertuiginfo alleen als er iets te zien is', () => {
		expect(heeftVoertuiginfo(ovLeg('A', 'B', '10:00', '10:30'))).toBe(true);
		expect(heeftVoertuiginfo(ovLeg('A', 'B', '10:00', '10:30', { modus: 'bus', ritnummer: undefined }))).toBe(false);
		expect(heeftVoertuiginfo(ovLeg('A', 'B', '10:00', '10:30', { modus: 'bus', ritnummer: undefined, rolstoel: true }))).toBe(true);
	});
});

describe('eerder gereden ritten', () => {
	it('houdt per treinstel de laatste ritten bij, zonder dubbelen', async () => {
		const docs = new Map<string, Record<string, unknown>>();
		const fs = {
			async get<T>(pad: string): Promise<FsDocument<T> | null> {
				const d = docs.get(pad);
				return d ? { id: pad, pad, data: structuredClone(d) as T } : null;
			},
			async zet(pad: string, data: Record<string, unknown>) {
				docs.set(pad, data);
			}
		};
		const info = { ritnummer: '3531', ritVan: 'Den Helder', ritNaar: 'Nijmegen', delen: [{ nummer: '9401', faciliteiten: [], bakken: 6 }] } as unknown as TreinInfo;
		await logRit(fs, info, '2026-09-26T08:00:00+02:00');
		await logRit(fs, { ...info, ritnummer: '3536' } as TreinInfo, '2026-09-26T10:00:00+02:00');
		await logRit(fs, info, '2026-09-26T08:00:00+02:00');
		const h = await ritHistorie(fs, ['9401', 'x']);
		expect(h['9401'].map((r) => r.ritnummer)).toEqual(['3536', '3531']);
		expect(h['9401'][0]).toMatchObject({ datum: '2026-09-26', van: 'Den Helder', naar: 'Nijmegen' });
		expect(h.x).toBeUndefined();
	});
});
