import { describe, expect, it } from 'vitest';
import { plekOpLijn, ritVoortgang, spreidPosities, stopPosities, stopTijden, voorbij } from './voortgang';
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

describe('tussenstops op de lijn', () => {
	const stops = [
		{ aankomst: t(0), vertrek: t(0) },
		{ aankomst: t(9), vertrek: t(11) },
		{ aankomst: t(15), vertrek: t(15) },
		{ aankomst: t(40), vertrek: t(40) }
	];

	it('verdeelt de haltes op tijd (midden van de stilstand)', () => {
		expect(stopPosities(stops)).toEqual([0, 0.25, 0.375, 1]);
	});

	it('blijft oplopend als de tijden niet kloppen', () => {
		const raar = [stops[0], { aankomst: t(20), vertrek: t(20) }, { aankomst: t(10), vertrek: t(10) }, stops[3]];
		expect(stopPosities(raar)).toEqual([0, 0.5, 0.5, 1]);
	});

	it('houdt uitgeklapt een minimale afstand en begint onder de ritinformatie', () => {
		const pos = stopPosities(stops);
		// 400 px: 0, 100, 150, 400
		expect(spreidPosities(pos, 400, 24)).toEqual([0, 100, 150, 400]);
		// Dicht op elkaar: minstens 24 px ertussen
		expect(spreidPosities(pos, 100, 24)).toEqual([0, 25, 49, 100]);
		// Eerste tussenstop pas vanaf 80 px; de rest schuift mee
		expect(spreidPosities(pos, 100, 24, 80)).toEqual([0, 80, 104, 128]);
		// En ruimte voor de naam van het aankomststation
		expect(spreidPosities(pos, 100, 24, 30, 40)).toEqual([0, 30, 54, 100]);
		expect(spreidPosities(pos, 80, 24, 30, 40)).toEqual([0, 30, 54, 94]);
	});

	it('het bolletje bereikt een stipje precies als de trein bij die halte is', () => {
		const ys = [0, 100, 150, 400];
		expect(plekOpLijn(ys, ritVoortgang(stops, t(4.5))!)).toBe(50);
		// Bij de halte (stilstand) staat het bolletje op het stipje
		expect(plekOpLijn(ys, ritVoortgang(stops, t(10))!)).toBe(100);
		expect(plekOpLijn(ys, ritVoortgang(stops, t(13))!)).toBe(125);
	});
});
