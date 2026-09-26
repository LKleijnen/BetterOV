import { describe, expect, it } from 'vitest';
import { codeerPolyline, decodeerPolyline, lijnLengte, puntOpLijn } from './geo';
import { klok, nlDatumTijd, nlOnderdelen, vertragingMinuten } from './tijd';
import { maakIcs } from './ics';
import { maakAdvies, ovLeg } from './testdata';
import { nachtGrens } from './server/laatste';

describe('polyline', () => {
	it('codeert en decodeert heen en weer', () => {
		const lijn: [number, number][] = [
			[5.1101, 52.0894],
			[4.9003, 52.3789]
		];
		for (const precisie of [5, 6, 7]) {
			const terug = decodeerPolyline(codeerPolyline(lijn, precisie), precisie);
			expect(terug[1][0]).toBeCloseTo(4.9003, 4);
			expect(terug[1][1]).toBeCloseTo(52.3789, 4);
		}
		// Bekend voorbeeld uit de Google-documentatie
		expect(decodeerPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')[0]).toEqual([-120.2, 38.5]);
	});

	it('berekent lengte en tussenpunt', () => {
		const lijn: [number, number][] = [
			[5, 52],
			[5, 52.01]
		];
		expect(lijnLengte(lijn)).toBeGreaterThan(1100);
		expect(puntOpLijn(lijn, 0.5)![1]).toBeCloseTo(52.005, 5);
	});
});

describe('Nederlandse tijd', () => {
	it('rekent zomer- en wintertijd goed om', () => {
		expect(nlDatumTijd('2026-07-01', '12:00').toISOString()).toBe('2026-07-01T10:00:00.000Z');
		expect(nlDatumTijd('2026-12-01', '12:00').toISOString()).toBe('2026-12-01T11:00:00.000Z');
		expect(klok('2026-07-01T10:05:00Z')).toBe('12:05');
		expect(nlOnderdelen(new Date('2026-09-25T22:30:00Z')).weekdag).toBe(6);
	});

	it('berekent vertraging', () => {
		expect(vertragingMinuten({ gepland: '2026-09-25T10:00:00Z', verwacht: '2026-09-25T10:04:00Z' })).toBe(4);
	});

	it('legt de nachtgrens voor de laatste verbinding op 03:30', () => {
		expect(nachtGrens(new Date('2026-09-25T20:00:00Z')).toISOString()).toBe('2026-09-26T01:30:00.000Z');
		expect(nachtGrens(new Date('2026-09-25T23:30:00Z')).toISOString()).toBe('2026-09-26T01:30:00.000Z');
	});
});

describe('agenda-export', () => {
	it('maakt een geldig .ics-bestand met overstap', () => {
		const advies = maakAdvies([
			ovLeg('Utrecht Centraal', 'Amersfoort Centraal', '10:00', '10:15'),
			ovLeg('Amersfoort Centraal', 'Zwolle', '10:21', '10:50')
		]);
		const ics = maakIcs(advies, { naam: 'Utrecht Centraal', lat: 52, lon: 5 }, { naam: 'Zwolle', lat: 52.5, lon: 6 });
		expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
		expect(ics).toContain('DTSTART:20260925T080000Z');
		expect(ics).toContain('DTEND:20260925T085000Z');
		expect(ics).toContain('SUMMARY:Reis naar Zwolle');
		expect(ics.replace(/\r\n /g, '')).toContain('Overstap 6 min in Amersfoort Centraal');
		for (const regel of ics.split('\r\n')) expect(new TextEncoder().encode(regel).length).toBeLessThanOrEqual(75);
	});
});
