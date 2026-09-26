// Nepdata voor ontwikkeling en tests (MOCK_API=1). Nooit gebruikt in productie.

import type { Advies, Halte, Leg, PlanAntwoord, Plek, TreinInfo, Vertrek, VertrekAntwoord, Voorkeur } from '../types';
import { adviesId, herbereken } from '../reis';
import { afstandMeter, codeerPolyline, looptijdSeconden } from '../geo';
import { sorteer } from './planner';
import { schattingTrein } from './prijs';

const STATIONS: Plek[] = [
	{ naam: 'Utrecht Centraal', lat: 52.0894, lon: 5.1101 },
	{ naam: 'Amsterdam Centraal', lat: 52.3789, lon: 4.9003 },
	{ naam: 'Den Haag Centraal', lat: 52.0808, lon: 4.3247 },
	{ naam: 'Rotterdam Centraal', lat: 51.9249, lon: 4.469 },
	{ naam: 'Amersfoort Centraal', lat: 52.1535, lon: 5.3731 },
	{ naam: 'Schiphol Airport', lat: 52.3094, lon: 4.7617 },
	{ naam: 'Eindhoven Centraal', lat: 51.4433, lon: 5.4814 },
	{ naam: 'Zwolle', lat: 52.5046, lon: 6.0911 },
	{ naam: 'Leiden Centraal', lat: 52.1661, lon: 4.4819 },
	{ naam: 'Arnhem Centraal', lat: 51.985, lon: 5.8998 },
	{ naam: "'s-Hertogenbosch", lat: 51.6906, lon: 5.2934 },
	{ naam: 'Groningen', lat: 53.2107, lon: 6.5645 }
].map((s, i) => ({ ...s, type: 'station' as const, stopId: `mock_station_${i}` }));

const ADRESSEN: Plek[] = [
	{ naam: 'Oudegracht 100', omschrijving: '3511 AW Utrecht', lat: 52.0908, lon: 5.1198, type: 'adres' },
	{ naam: 'Damrak 1', omschrijving: '1012 LG Amsterdam', lat: 52.3752, lon: 4.8966, type: 'adres' },
	{ naam: 'Kerkstraat 12', omschrijving: '3811 CV Amersfoort', lat: 52.1561, lon: 5.3878, type: 'adres' },
	{ naam: 'Stationsplein, bus', omschrijving: 'Utrecht', lat: 52.0886, lon: 5.1115, type: 'halte', stopId: 'mock_halte_1' }
];

export function mockZoek(tekst: string): Plek[] {
	const t = tekst.toLowerCase();
	return [...STATIONS, ...ADRESSEN].filter((p) => `${p.naam} ${p.omschrijving ?? ''}`.toLowerCase().includes(t)).slice(0, 8);
}

function dichtsteStation(p: Plek): Plek {
	return STATIONS.reduce((a, b) => (afstandMeter(p.lat, p.lon, a.lat, a.lon) <= afstandMeter(p.lat, p.lon, b.lat, b.lon) ? a : b));
}

function iso(t: number) {
	return new Date(t).toISOString();
}

function lijn(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
	return { punten: codeerPolyline([[a.lon, a.lat], [b.lon, b.lat]], 6), precisie: 6 };
}

function loopleg(van: Plek | Halte, naar: Plek | Halte, start: number): Leg {
	const duur = Math.max(60, looptijdSeconden(van.lat, van.lon, naar.lat, naar.lon));
	return {
		modus: 'lopen',
		van: { naam: van.naam, lat: van.lat, lon: van.lon },
		naar: { naam: naar.naam, lat: naar.lat, lon: naar.lon },
		vertrek: { gepland: iso(start), verwacht: iso(start) },
		aankomst: { gepland: iso(start + duur * 1000), verwacht: iso(start + duur * 1000) },
		duur,
		tussenstops: [],
		realtime: false,
		uitgevallen: false,
		isNS: false,
		polyline: lijn(van, naar),
		meldingen: []
	};
}

function treinleg(van: Plek, naar: Plek, start: number, vertraging: number, rit: number, opties: { spoorwijziging?: boolean; uitgevallen?: boolean; sprinter?: boolean } = {}): Leg {
	const km = afstandMeter(van.lat, van.lon, naar.lat, naar.lon) / 1000;
	const duur = Math.round((km / (opties.sprinter ? 60 : 85)) * 3600 + 120);
	const eind = start + duur * 1000;
	const spoor = String(5 + (rit % 14));
	const tussen: Halte[] = [1, 2].map((k) => {
		const f = k / 3;
		const t = start + duur * 1000 * f;
		return {
			naam: `${van.naam.split(' ')[0]}–${naar.naam.split(' ')[0]} ${k}`,
			lat: van.lat + (naar.lat - van.lat) * f,
			lon: van.lon + (naar.lon - van.lon) * f,
			aankomst: { gepland: iso(t), verwacht: iso(t + vertraging * 60000) },
			vertrek: { gepland: iso(t + 60000), verwacht: iso(t + 60000 + vertraging * 60000) },
			spoor: '2',
			geplandSpoor: '2'
		};
	});
	return {
		modus: 'trein',
		van: {
			naam: van.naam,
			lat: van.lat,
			lon: van.lon,
			stopId: van.stopId,
			vertrek: { gepland: iso(start), verwacht: iso(start + vertraging * 60000) },
			geplandSpoor: spoor,
			spoor: opties.spoorwijziging ? String(Number(spoor) + 1) + 'a' : spoor,
			uitgevallen: opties.uitgevallen || undefined
		},
		naar: {
			naam: naar.naam,
			lat: naar.lat,
			lon: naar.lon,
			stopId: naar.stopId,
			aankomst: { gepland: iso(eind), verwacht: iso(eind + vertraging * 60000) },
			geplandSpoor: '7',
			spoor: '7'
		},
		vertrek: { gepland: iso(start), verwacht: iso(start + vertraging * 60000) },
		aankomst: { gepland: iso(eind), verwacht: iso(eind + vertraging * 60000) },
		duur,
		tussenstops: tussen,
		lijn: opties.sprinter ? 'SPR' : 'IC',
		productNaam: opties.sprinter ? 'Sprinter' : 'Intercity',
		richting: naar.naam,
		vervoerder: 'NS',
		ritnummer: String(rit),
		tripId: `mock_trip_${rit}`,
		realtime: true,
		uitgevallen: !!opties.uitgevallen,
		isNS: true,
		polyline: lijn(van, naar),
		meldingen: opties.uitgevallen ? [{ kop: 'Deze trein rijdt niet door een seinstoring', ernst: 'ernstig' }] : [],
		drukte: (['laag', 'gemiddeld', 'hoog'] as const)[rit % 3]
	};
}

function busleg(van: Halte | Plek, naar: Plek, start: number, nummer: string): Leg {
	const duur = Math.max(300, Math.round((afstandMeter(van.lat, van.lon, naar.lat, naar.lon) / 1000 / 22) * 3600));
	const eind = start + duur * 1000;
	return {
		modus: 'bus',
		van: { naam: `${van.naam} (bushalte)`, lat: van.lat, lon: van.lon, vertrek: { gepland: iso(start), verwacht: iso(start + 60000) }, spoor: 'B3', geplandSpoor: 'B3' },
		naar: { naam: `${naar.naam} (halte)`, lat: naar.lat, lon: naar.lon, aankomst: { gepland: iso(eind), verwacht: iso(eind + 60000) } },
		vertrek: { gepland: iso(start), verwacht: iso(start + 60000) },
		aankomst: { gepland: iso(eind), verwacht: iso(eind + 60000) },
		duur,
		tussenstops: [],
		lijn: nummer,
		productNaam: 'Bus',
		richting: naar.naam,
		vervoerder: 'Qbuzz',
		tripId: `mock_bus_${nummer}_${start}`,
		realtime: true,
		uitgevallen: false,
		isNS: false,
		polyline: lijn(van, naar),
		kleur: '#e30613',
		tekstKleur: '#ffffff',
		meldingen: []
	};
}

export function mockPlan(v: { van: Plek; naar: Plek; tijd?: string; voorkeur: Voorkeur; cursor?: string }): PlanAntwoord {
	const basis = v.cursor ? Number(v.cursor) : v.tijd ? Date.parse(v.tijd) : Date.now();
	const s1 = v.van.type === 'station' ? v.van : dichtsteStation(v.van);
	let s2 = v.naar.type === 'station' ? v.naar : dichtsteStation(v.naar);
	if (s1.naam === s2.naam) s2 = STATIONS.find((s) => s.naam !== s1.naam)!;
	const overstap = STATIONS.find((s) => s.naam === 'Utrecht Centraal' && s.naam !== s1.naam && s.naam !== s2.naam) ?? STATIONS[4];
	const adviezen: Advies[] = [];
	for (let k = 0; k < 5; k++) {
		const legs: Leg[] = [];
		let t = basis + k * 15 * 60000;
		if (v.van.type !== 'station') {
			const l = loopleg(v.van, s1, t);
			legs.push(l);
			t = Date.parse(l.aankomst.verwacht) + 4 * 60000;
		}
		const rit = 3000 + ((Math.floor(basis / 900000) + k) % 900) * 2;
		if (k % 2 === 0) {
			legs.push(treinleg(s1, s2, t, k === 0 ? 3 : 0, rit, { spoorwijziging: k === 2 }));
		} else {
			const a = treinleg(s1, overstap, t, k === 3 ? 4 : 0, rit, { sprinter: true });
			legs.push(a);
			const b = treinleg(overstap, s2, Date.parse(a.aankomst.gepland) + (k === 3 ? 5 : 8) * 60000, 0, rit + 1);
			legs.push(b);
		}
		const laatste = legs[legs.length - 1];
		if (v.naar.type !== 'station') {
			const eind = Date.parse(laatste.aankomst.verwacht) + 3 * 60000;
			if (k === 1) legs.push(busleg(laatste.naar, v.naar, eind, '12'));
			else legs.push(loopleg(laatste.naar, v.naar, Date.parse(laatste.aankomst.verwacht)));
		}
		const advies = herbereken({
			id: adviesId(legs),
			bron: 'transitous',
			vertrek: legs[0].vertrek,
			aankomst: legs[legs.length - 1].aankomst,
			duur: 0,
			overstappen: 0,
			legs
		});
		const km = afstandMeter(s1.lat, s1.lon, s2.lat, s2.lon) / 1000;
		const trein = schattingTrein(km * 1.2);
		const bus = legs.some((l) => l.modus === 'bus') ? 250 : 0;
		advies.prijs = {
			bedrag: trein + bus,
			exact: bus === 0,
			onderdelen: [
				{ omschrijving: `Trein ${s1.naam} – ${s2.naam}`, bedrag: trein, exact: true },
				...(bus ? [{ omschrijving: 'Bus 12', bedrag: bus, exact: false }] : [])
			]
		};
		adviezen.push(advies);
	}
	return {
		adviezen: sorteer(adviezen, v.voorkeur),
		bron: 'transitous',
		vorige: String(basis - 75 * 60000),
		volgende: String(basis + 75 * 60000),
		drukteBeschikbaar: true,
		opgehaaldOp: new Date().toISOString()
	};
}

/** Nep-spoorkaart: gebogen lijnen tussen de nepstations, zodat de route over het spoor zichtbaar anders is */
export function mockSpoorkaart() {
	const paren: [number, number][] = [
		[0, 4], [0, 1], [0, 2], [0, 3], [0, 6], [0, 9], [0, 10], [1, 5], [5, 8], [8, 2], [2, 3], [4, 7], [7, 11], [10, 6]
	];
	const bocht = (a: Plek, b: Plek): [number, number][] => {
		const punten: [number, number][] = [];
		for (let i = 0; i <= 12; i++) {
			const f = i / 12;
			const uit = Math.sin(f * Math.PI) * 0.06;
			punten.push([a.lon + (b.lon - a.lon) * f + uit, a.lat + (b.lat - a.lat) * f - uit / 2]);
		}
		return punten;
	};
	return {
		payload: {
			type: 'FeatureCollection',
			features: paren.map(([a, b]) => ({
				type: 'Feature',
				properties: { from: STATIONS[a].naam, to: STATIONS[b].naam },
				geometry: { type: 'LineString', coordinates: bocht(STATIONS[a], STATIONS[b]) }
			}))
		}
	};
}

/** Intercity (ICM) zonder indeling per bak: stilte en eerste klas alleen per treinstel bekend */
function mockIcm(ritnummer: string): TreinInfo {
	return {
		ritnummer,
		station: 'Utrecht Centraal',
		type: 'ICM',
		vervoerder: 'NS',
		spoor: '7',
		delen: [
			{ nummer: '4235', type: 'ICM-4', faciliteiten: ['TOILET', 'STILTE', 'WIFI'], bakken: 4, eersteKlas: true },
			{ nummer: '4031', type: 'ICM-3', faciliteiten: ['TOILET', 'WIFI'], bakken: 3, eersteKlas: true }
		],
		aantalBakken: 7,
		normaalBakken: 7,
		ingekort: false,
		lengteMeter: 188,
		drukte: 'gemiddeld',
		faciliteiten: ['TOILET', 'STILTE', 'WIFI'],
		instapadvies: {
			eersteKlas: [],
			stilte: [],
			rijrichting: 'rechts',
			samenvatting: ['Eerste klas: in het achterste treinstel en in het voorste treinstel', 'Stiltecoupé: in het achterste treinstel'],
			nauwkeurig: false
		},
		zitplaatsen: 480,
		bron: ['Mockdata'],
		opgehaaldOp: new Date().toISOString()
	};
}

export function mockVertrektijden(naam = 'Utrecht Centraal'): VertrekAntwoord {
	const nu = Date.now();
	const vertrekken: Vertrek[] = [];
	for (let i = 0; i < 24; i++) {
		const t = nu + i * 3 * 60000 + 60000;
		const trein = i % 3 !== 2;
		const vertraging = i % 5 === 1 ? 4 : 0;
		const bestemming = STATIONS[(i * 5 + 1) % STATIONS.length].naam;
		vertrekken.push({
			tijd: { gepland: iso(t), verwacht: iso(t + vertraging * 60000) },
			richting: trein ? bestemming : 'Nieuwegein Zuid',
			lijn: trein ? (i % 2 ? 'SPR' : 'IC') : String(20 + i),
			productNaam: trein ? (i % 2 ? 'Sprinter' : 'Intercity') : i % 2 ? 'Tram' : 'Bus',
			modus: trein ? 'trein' : i % 2 ? 'tram' : 'bus',
			vervoerder: trein ? 'NS' : 'Qbuzz',
			spoor: trein ? String(5 + (i % 14)) + (i === 4 ? 'b' : '') : undefined,
			geplandSpoor: trein ? String(5 + (i % 14)) : undefined,
			uitgevallen: i === 6,
			realtime: true,
			tripId: `mock_trip_${4000 + i}`,
			ritnummer: trein ? String(4000 + i * 2) : undefined,
			isNS: trein,
			halteNaam: naam,
			meldingen: i === 6 ? [{ kop: 'Rijdt niet', ernst: 'ernstig' }] : [],
			via: trein ? ['Amersfoort Centraal', 'Zwolle'] : undefined
		});
	}
	return { halte: { naam }, vertrekken, bron: 'transitous', opgehaaldOp: new Date().toISOString() };
}

export function mockTrein(ritnummer: string): TreinInfo {
	const kort = Number(ritnummer) % 4 === 0;
	if (Number(ritnummer) % 4 === 2) return mockIcm(ritnummer);
	return {
		ritnummer,
		station: 'Utrecht Centraal',
		type: 'VIRM',
		vervoerder: 'NS',
		spoor: '5',
		delen: [
			{ nummer: '9401', type: 'VIRM-6', faciliteiten: ['TOILET', 'STILTE', 'STROOM', 'WIFI', 'TOEGANKELIJK'], bakken: 6, indeling: [
				{ eersteKlas: false, stilte: true }, { eersteKlas: false, stilte: false }, { eersteKlas: true, stilte: false },
				{ eersteKlas: true, stilte: true }, { eersteKlas: false, stilte: false }, { eersteKlas: false, stilte: false }
			] },
			...(kort ? [] : [{ nummer: '8702', type: 'VIRM-4', faciliteiten: ['TOILET', 'STROOM', 'WIFI'], bakken: 4, indeling: [
				{ eersteKlas: false, stilte: false }, { eersteKlas: true, stilte: false }, { eersteKlas: false, stilte: false }, { eersteKlas: false, stilte: true }
			] }])
		],
		aantalBakken: kort ? 6 : 10,
		normaalBakken: 10,
		ingekort: kort,
		lengteMeter: kort ? 162 : 270,
		drukte: kort ? 'hoog' : 'gemiddeld',
		faciliteiten: ['TOILET', 'STILTE', 'STROOM', 'WIFI', 'TOEGANKELIJK'],
		instapadvies: kort
			? { eersteKlas: [{ van: 2 / 6, tot: 4 / 6 }], stilte: [{ van: 0, tot: 1 / 6 }, { van: 3 / 6, tot: 4 / 6 }], rijrichting: 'links', samenvatting: ['Eerste klas: midden', 'Stiltecoupé: voorin en midden'], nauwkeurig: true }
			: { eersteKlas: [{ van: 0.2, tot: 0.4 }, { van: 0.7, tot: 0.8 }], stilte: [{ van: 0, tot: 0.1 }, { van: 0.3, tot: 0.4 }, { van: 0.9, tot: 1 }], rijrichting: 'links', samenvatting: ['Eerste klas: voorin en achterin', 'Stiltecoupé: voorin, midden en achterin'], nauwkeurig: true },
		zitplaatsen: kort ? 570 : 950,
		bron: ['Mockdata'],
		opgehaaldOp: new Date().toISOString()
	};
}
