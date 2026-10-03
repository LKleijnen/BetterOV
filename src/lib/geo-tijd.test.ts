import { describe, expect, it } from 'vitest';
import { codeerPolyline, decodeerPolyline, lijnLengte, puntOpLijn, snelheidKmu } from './geo';
import { klok, nlDatumTijd, nlOnderdelen, vertragingMinuten } from './tijd';
import { maakIcs } from './ics';
import { loopLeg, maakAdvies, ovLeg } from './testdata';
import { nachtGrens } from './server/laatste';

describe('snelheid', () => {
	it('gebruikt de snelheid van het toestel', () => {
		expect(snelheidKmu({ lat: 52, lon: 5, nauwkeurigheid: 10, tijd: 0, snelheid: 25 })).toBeCloseTo(90);
	});
	it('rekent anders uit twee metingen', () => {
		// 0,01 graad noorderbreedte is ruim 1100 m; in 30 s is dat ongeveer 133 km/u
		const v = snelheidKmu({ lat: 52.01, lon: 5, nauwkeurigheid: 15, tijd: 30000 }, { lat: 52, lon: 5, nauwkeurigheid: 15, tijd: 0 });
		expect(v).toBeGreaterThan(130);
		expect(v).toBeLessThan(137);
	});
	it('zegt niets bij onnauwkeurige of te snelle metingen', () => {
		expect(snelheidKmu({ lat: 52.0005, lon: 5, nauwkeurigheid: 80, tijd: 10000 }, { lat: 52, lon: 5, nauwkeurigheid: 80, tijd: 0 })).toBeUndefined();
		expect(snelheidKmu({ lat: 52.001, lon: 5, nauwkeurigheid: 5, tijd: 1000 }, { lat: 52, lon: 5, nauwkeurigheid: 5, tijd: 0 })).toBeUndefined();
	});
});

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
		const plat = ics.replace(/\r\n /g, '');
		expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
		// Eén afspraak per trein
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(ics).toContain('DTSTART:20260925T080000Z');
		expect(ics).toContain('DTEND:20260925T081500Z');
		expect(ics).toContain('DTSTART:20260925T082100Z');
		expect(ics).toContain('DTEND:20260925T085000Z');
		expect(plat).toContain('SUMMARY:Intercity naar Amersfoort Centraal (spoor 5)');
		expect(plat).toContain('Daarna overstappen (6 min): Intercity om 10:21');
		expect(plat).toContain('Uitstappen 10:50: Zwolle\\, spoor 7');
		// Alleen bij de eerste rit een herinnering
		expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1);
		for (const regel of ics.split('\r\n')) expect(new TextEncoder().encode(regel).length).toBeLessThanOrEqual(75);
	});

	it('zet de herinnering eerder als je eerst moet lopen', () => {
		const advies = maakAdvies([loopLeg('Thuis', 'Utrecht Centraal', '09:48', 12), ovLeg('Utrecht Centraal', 'Zwolle', '10:00', '10:50')]);
		const ics = maakIcs(advies, { naam: 'Thuis', lat: 52, lon: 5 }, { naam: 'Zwolle', lat: 52.5, lon: 6 });
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
		expect(ics).toContain('TRIGGER:-PT27M');
		expect(ics.replace(/\r\n /g, '')).toContain('12 min lopen');
	});
});
