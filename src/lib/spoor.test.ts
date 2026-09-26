import { describe, expect, it } from 'vitest';
import { dichtsteKnoop, isGrof, kortsteRoute, leesSpoorkaart, maakNetwerk, spoorRoute, type Punt } from './spoor';

// Drie stations op een rij (A - B - C) en een zijtak B - D, als GeoJSON zoals de NS SpoorKaart
const A: Punt = [5.0, 52.0];
const B: Punt = [5.1, 52.0];
const C: Punt = [5.2, 52.0];
const D: Punt = [5.1, 52.1];
const kaart = {
	payload: {
		type: 'FeatureCollection',
		features: [
			{ type: 'Feature', properties: { from: 'a', to: 'b' }, geometry: { type: 'LineString', coordinates: [A, [5.05, 52.01], B] } },
			// Loopt andersom en sluit met een paar meter verschil aan op B
			{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [C, [5.15, 51.99], [5.1002, 52.0001]] } },
			{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[B, D]] } }
		]
	}
};

describe('spoorkaart', () => {
	it('leest lijnen uit verschillende verpakkingen', () => {
		expect(leesSpoorkaart(kaart)).toHaveLength(3);
		expect(leesSpoorkaart(kaart.payload.features[0].geometry)).toHaveLength(1);
		expect(leesSpoorkaart({ iets: 'anders' })).toHaveLength(0);
	});

	it('voegt aansluitende eindpunten samen', () => {
		const n = maakNetwerk(leesSpoorkaart(kaart));
		expect(n.knopen).toHaveLength(4);
		expect(n.randen).toHaveLength(3);
	});

	it('vindt de route over het spoor, ook tegen de tekenrichting in', () => {
		const n = maakNetwerk(leesSpoorkaart(kaart));
		const route = kortsteRoute(n, dichtsteKnoop(n, A[1], A[0]), dichtsteKnoop(n, C[1], C[0]))!;
		expect(route[0]).toEqual(A);
		expect(route[route.length - 1]).toEqual(C);
		// Via de bochten, dus meer punten dan alleen de stations
		expect(route.length).toBeGreaterThan(4);
		expect(route).toContainEqual([5.15, 51.99]);
	});

	it('rijdt langs de haltes en slaat tussenhaltes zonder spoor over', () => {
		const n = maakNetwerk(leesSpoorkaart(kaart));
		const haltes = [
			{ lat: A[1], lon: A[0] },
			{ lat: 53, lon: 7 },
			{ lat: B[1], lon: B[0] },
			{ lat: D[1], lon: D[0] }
		];
		const route = spoorRoute(n, haltes)!;
		expect(route[route.length - 1]).toEqual(D);
		expect(spoorRoute(n, [{ lat: 53, lon: 7 }, { lat: A[1], lon: A[0] }])).toBeNull();
	});

	it('herkent een grove lijn (alleen rechte stukken)', () => {
		expect(isGrof([A, C], 2)).toBe(true);
		expect(isGrof(Array.from({ length: 40 }, (_, i) => [5 + i / 100, 52] as Punt), 3)).toBe(false);
	});
});
