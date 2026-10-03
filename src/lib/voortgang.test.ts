import { describe, expect, it } from 'vitest';
import { ritVoortgang, stopTijden, voorbij } from './voortgang';
import { ovLeg, t as tijd } from './testdata';

const t = (min: number) => Date.parse('2026-10-02T10:00:00Z') + min * 60000;

describe('voortgang tijdens een rit', () => {
	const stops = [
		{ aankomst: t(0), vertrek: t(0) },
		{ aankomst: t(10), vertrek: t(12) },
		{ aankomst: t(20), vertrek: t(20) }
	];

	it('geeft niets vóór vertrek en na aankomst', () => {
		expect(ritVoortgang(stops, t(-1))).toBeNull();
		expect(ritVoortgang(stops, t(20))).toBeNull();
	});

	it('zit halverwege tussen twee haltes', () => {
		expect(ritVoortgang(stops, t(5))).toEqual({ index: 0, fractie: 0.5 });
		expect(ritVoortgang(stops, t(16))).toEqual({ index: 1, fractie: 0.5 });
	});

	it('staat stil bij een halte', () => {
		expect(ritVoortgang(stops, t(11))).toEqual({ index: 1, fractie: 0 });
	});

	it('haalt de tijden uit de rit, met of zonder tussenstops', () => {
		const leg = ovLeg('A', 'B', '12:00', '12:20');
		leg.tussenstops = [{ naam: 'Tussen', lat: 52, lon: 5, aankomst: { gepland: tijd('12:10'), verwacht: tijd('12:11') } }];
		const zonder = stopTijden(leg, false);
		expect(zonder).toEqual([
			{ aankomst: Date.parse(tijd('12:00')), vertrek: Date.parse(tijd('12:00')) },
			{ aankomst: Date.parse(tijd('12:20')), vertrek: Date.parse(tijd('12:20')) }
		]);
		const metStops = stopTijden(leg, true);
		expect(metStops).toHaveLength(3);
		// Alleen een aankomsttijd bekend: vertrek is dan diezelfde (verwachte) tijd
		expect(metStops[1]).toEqual({ aankomst: Date.parse(tijd('12:11')), vertrek: Date.parse(tijd('12:11')) });
	});

	it('weet welke haltes al voorbij zijn', () => {
		expect(voorbij({ verwacht: '2026-10-02T10:10:00Z' }, t(11))).toBe(true);
		expect(voorbij({ verwacht: '2026-10-02T10:10:00Z' }, t(9))).toBe(false);
		expect(voorbij(undefined, t(9))).toBe(false);
	});
});
