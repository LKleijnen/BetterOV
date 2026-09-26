import { afterEach, describe, expect, it, vi } from 'vitest';
import { normaliseerItinerary, modusVan, treinProduct } from './motis';
import { nsTijd, nsTripNaarAdvies, stationVoorPlek, type NsStation } from './ns';
import { snijLeg, herplanLooplegs } from './reisstatus';
import { schattingTrein, berekenPrijs } from './prijs';
import { naarVelden, vanVelden, Tijdstempel } from './firestore';
import { plan, sorteer } from './planner';
import { berekenInstapadvies } from './trein';
import { bakIndeling } from './ns';
import { kiesLaatste } from './laatste';
import { maakAdvies, ovLeg, loopLeg, t } from '../testdata';

// Voorbeeld volgens de MOTIS OpenAPI-spec (v6): lopen, trein, lopen
const motisItinerary = {
	duration: 3000,
	startTime: '2026-09-25T08:40:00Z',
	endTime: '2026-09-25T09:30:00Z',
	transfers: 0,
	legs: [
		{
			mode: 'WALK',
			from: { name: 'START', lat: 52.0908, lon: 5.1198 },
			to: { name: 'Utrecht Centraal', lat: 52.0894, lon: 5.1101, stopId: 'nl_ut_5' },
			duration: 600,
			startTime: '2026-09-25T08:40:00Z',
			endTime: '2026-09-25T08:50:00Z',
			scheduledStartTime: '2026-09-25T08:40:00Z',
			scheduledEndTime: '2026-09-25T08:50:00Z',
			realTime: false,
			scheduled: true,
			distance: 780,
			legGeometry: { points: '', precision: 6, length: 0 }
		},
		{
			mode: 'RAIL',
			from: {
				name: 'Utrecht Centraal',
				stopId: 'nl_ut_5',
				lat: 52.0894,
				lon: 5.1101,
				departure: '2026-09-25T08:55:00Z',
				scheduledDeparture: '2026-09-25T08:53:00Z',
				track: '7',
				scheduledTrack: '5'
			},
			to: {
				name: 'Amsterdam Centraal',
				stopId: 'nl_asd_7',
				lat: 52.3789,
				lon: 4.9003,
				arrival: '2026-09-25T09:22:00Z',
				scheduledArrival: '2026-09-25T09:20:00Z',
				track: '7',
				scheduledTrack: '7'
			},
			duration: 1620,
			startTime: '2026-09-25T08:55:00Z',
			endTime: '2026-09-25T09:22:00Z',
			scheduledStartTime: '2026-09-25T08:53:00Z',
			scheduledEndTime: '2026-09-25T09:20:00Z',
			realTime: true,
			scheduled: true,
			headsign: 'Amsterdam Centraal',
			agencyName: 'NS',
			tripId: '20260925_10:53_nl_1',
			routeShortName: 'Intercity',
			tripShortName: '3045',
			displayName: 'IC 3045',
			intermediateStops: [
				{
					name: 'Amsterdam Amstel',
					lat: 52.346,
					lon: 4.917,
					arrival: '2026-09-25T09:14:00Z',
					scheduledArrival: '2026-09-25T09:12:00Z',
					departure: '2026-09-25T09:15:00Z',
					scheduledDeparture: '2026-09-25T09:13:00Z'
				}
			],
			legGeometry: { points: '', precision: 6, length: 0 },
			alerts: [{ headerText: 'Werkzaamheden', descriptionText: 'Extra reistijd', severityLevel: 'WARNING' }]
		},
		{
			mode: 'WALK',
			from: { name: 'Amsterdam Centraal', lat: 52.3789, lon: 4.9003 },
			to: { name: 'END', lat: 52.3752, lon: 4.8966 },
			duration: 480,
			startTime: '2026-09-25T09:22:00Z',
			endTime: '2026-09-25T09:30:00Z',
			scheduledStartTime: '2026-09-25T09:20:00Z',
			scheduledEndTime: '2026-09-25T09:28:00Z',
			realTime: false,
			scheduled: true,
			legGeometry: { points: '', precision: 6, length: 0 }
		}
	]
};

describe('Transitous-normalisatie', () => {
	it('zet een MOTIS-itinerary om naar een advies', () => {
		const a = normaliseerItinerary(motisItinerary as never, { naam: 'Oudegracht 100', lat: 52.09, lon: 5.12 }, { naam: 'Damrak 1', lat: 52.37, lon: 4.89 });
		expect(a.legs).toHaveLength(3);
		expect(a.legs[0].van.naam).toBe('Oudegracht 100');
		expect(a.legs[2].naar.naam).toBe('Damrak 1');
		const trein = a.legs[1];
		expect(trein.modus).toBe('trein');
		expect(trein.isNS).toBe(true);
		expect(trein.ritnummer).toBe('3045');
		expect(trein.productNaam).toBe('Intercity');
		expect(trein.van.spoor).toBe('7');
		expect(trein.van.geplandSpoor).toBe('5');
		expect(trein.tussenstops[0].naam).toBe('Amsterdam Amstel');
		expect(trein.meldingen[0].ernst).toBe('waarschuwing');
		expect(a.overstappen).toBe(0);
	});

	it('maakt een label zonder dubbele productnaam', () => {
		expect(treinProduct({ category: { shortName: 'IC', name: 'Intercity' }, routeShortName: 'IC', displayName: 'IC 3045' })).toEqual({ productNaam: 'Intercity', lijn: 'IC' });
		// Arriva Limburg: lijncode zegt meer dan "ST"
		expect(treinProduct({ category: { shortName: 'ST', name: 'Stoptrein' }, routeShortName: 'RS18' })).toEqual({ productNaam: 'Stoptrein', lijn: 'RS18' });
		expect(treinProduct({ displayName: 'Stoptrein RS18' })).toEqual({ productNaam: 'Stoptrein', lijn: 'RS18' });
		expect(treinProduct({ displayName: 'Sprinter 4867' })).toEqual({ productNaam: 'Sprinter', lijn: 'SPR' });
	});

	it('kent vervoerswijzen', () => {
		expect(modusVan('REGIONAL_RAIL')).toBe('trein');
		expect(modusVan('SUBWAY')).toBe('metro');
		expect(modusVan('COACH')).toBe('bus');
	});
});

describe('NS-normalisatie', () => {
	it('zet NS-tijden om naar geldige ISO', () => {
		expect(nsTijd('2026-09-25T10:30:00+0200')).toBe('2026-09-25T10:30:00+02:00');
		expect(Date.parse(nsTijd('2026-09-25T10:30:00+0200')!)).toBe(Date.parse('2026-09-25T08:30:00Z'));
	});

	it('zet een NS-trip om, met prijs en drukte', () => {
		const trip = {
			transfers: 0,
			status: 'NORMAL',
			productFare: { priceInCents: 920 },
			legs: [
				{
					travelType: 'PUBLIC_TRANSIT',
					direction: 'Amsterdam Centraal',
					cancelled: false,
					crowdForecast: 'MEDIUM',
					product: { number: '3045', type: 'TRAIN', operatorName: 'NS', shortCategoryName: 'IC', longCategoryName: 'Intercity' },
					origin: { name: 'Utrecht Centraal', lat: 52.08, lng: 5.11, plannedDateTime: '2026-09-25T10:53:00+0200', actualDateTime: '2026-09-25T10:55:00+0200', plannedTrack: '5', actualTrack: '7' },
					destination: { name: 'Amsterdam Centraal', lat: 52.37, lng: 4.9, plannedDateTime: '2026-09-25T11:20:00+0200', plannedTrack: '7' },
					stops: [
						{ name: 'Utrecht Centraal' },
						{ name: 'Amsterdam Amstel', lat: 52.34, lng: 4.91, plannedArrivalDateTime: '2026-09-25T11:12:00+0200', plannedDepartureDateTime: '2026-09-25T11:13:00+0200', plannedDepartureTrack: '3' },
						{ name: 'Duivendrecht', passing: true },
						{ name: 'Amsterdam Centraal' }
					]
				}
			]
		};
		const a = nsTripNaarAdvies(trip);
		expect(a.bron).toBe('ns');
		const leg = a.legs[0];
		expect(leg.isNS).toBe(true);
		expect(leg.ritnummer).toBe('3045');
		expect(leg.van.spoor).toBe('7');
		expect(leg.van.geplandSpoor).toBe('5');
		expect(leg.tussenstops.map((s) => s.naam)).toEqual(['Amsterdam Amstel']);
		expect(leg.drukte).toBe('gemiddeld');
		expect(a.prijs?.bedrag).toBe(920);
		expect(a.prijs?.exact).toBe(true);
	});

	it('koppelt plekken aan NS-stations', () => {
		const stations: NsStation[] = [
			{ code: 'UT', uic: '8400621', naam: 'Utrecht Centraal', lat: 52.0894, lon: 5.1101, synoniemen: [] },
			{ code: 'ASD', uic: '8400058', naam: 'Amsterdam Centraal', lat: 52.3789, lon: 4.9003, synoniemen: [] }
		];
		expect(stationVoorPlek(stations, { naam: 'Utrecht Centraal', lat: 52.089, lon: 5.111, type: 'station' })?.code).toBe('UT');
		expect(stationVoorPlek(stations, { naam: 'Damrak 1', lat: 52.3752, lon: 4.8966, type: 'adres' })).toBeUndefined();
	});
});

describe('realtime verversen', () => {
	it('knipt het juiste stuk uit een volledige rit', () => {
		const oud = ovLeg('B', 'C', '10:10', '10:20');
		const rit = ovLeg('A', 'D', '10:00', '10:30');
		rit.tussenstops = [
			{ naam: 'B', lat: 0, lon: 0, stopId: 'stop-B', vertrek: { gepland: t('10:10'), verwacht: t('10:13') }, spoor: '4', geplandSpoor: '3' },
			{ naam: 'C', lat: 0, lon: 0, stopId: 'stop-C', aankomst: { gepland: t('10:20'), verwacht: t('10:23') } }
		];
		const nieuw = snijLeg(oud, rit);
		expect(nieuw.vertrek.verwacht).toBe(t('10:13'));
		expect(nieuw.aankomst.verwacht).toBe(t('10:23'));
		expect(nieuw.van.spoor).toBe('4');
		expect(nieuw.tussenstops).toEqual([]);
	});

	it('schuift looplegs mee met gewijzigde ritten', () => {
		const legs = herplanLooplegs([
			loopLeg('Thuis', 'A', '09:50', 5),
			ovLeg('A', 'B', '10:00', '10:20', { vertrekVerwacht: '10:04', aankomstVerwacht: '10:24' }),
			loopLeg('B', 'Werk', '10:20', 6)
		]);
		expect(Date.parse(legs[0].aankomst.verwacht)).toBe(Date.parse(t('10:04')));
		expect(Date.parse(legs[2].vertrek.verwacht)).toBe(Date.parse(t('10:24')));
		expect(Date.parse(legs[2].aankomst.verwacht)).toBe(Date.parse(t('10:30')));
	});
});

describe('prijzen', () => {
	it('schat treinprijs degressief met minimum', () => {
		expect(schattingTrein(1)).toBe(260);
		expect(schattingTrein(40)).toBe(970);
		expect(schattingTrein(220)).toBeGreaterThan(schattingTrein(100));
	});

	it('rekent bus zonder NS-key als indicatie met opstaptarief', async () => {
		const bus = ovLeg('Halte A', 'Halte B', '10:00', '10:20', { modus: 'bus', isNS: false, vervoerder: 'Qbuzz', afstand: undefined });
		bus.van.lat = 52.0;
		bus.naar.lat = 52.05;
		const p = await berekenPrijs(maakAdvies([bus]), undefined, []);
		expect(p?.exact).toBe(false);
		expect(p!.bedrag).toBeGreaterThan(112);
	});
});

describe('instapadvies', () => {
	it('bepaalt posities per bak met rijrichting', () => {
		const advies = berekenInstapadvies({
			ritnummer: '1',
			delen: [
				{ faciliteiten: ['STILTE'], bakken: 4, indeling: [
					{ eersteKlas: true, stilte: false },
					{ eersteKlas: false, stilte: false },
					{ eersteKlas: false, stilte: false },
					{ eersteKlas: false, stilte: true }
				] }
			],
			ingekort: false,
			rijrichting: 'links',
			eersteKlasPerDeel: [true],
			ruw: null
		});
		expect(advies?.nauwkeurig).toBe(true);
		expect(advies?.eersteKlas).toEqual([{ van: 0, tot: 0.25 }]);
		expect(advies?.samenvatting).toEqual(['Eerste klas: voorin', 'Stiltecoupé: achterin']);
	});
});

describe('stilte en eerste klas per bak', () => {
	it('tekent treinstel-informatie niet op elke bak', () => {
		// Elke bak draagt de faciliteiten van het hele treinstel mee: niet bruikbaar per bak
		const bakken = [1, 2, 3, 4].map(() => ({ faciliteiten: ['STILTE', 'TOILET'] }));
		expect(bakIndeling(bakken)).toBeUndefined();
	});

	it('negeert afbeeldingen en links bij het zoeken naar stilte', () => {
		const bakken = [
			{ afbeelding: { url: 'https://x/icm_stilte.png' }, klasse: 1 },
			{ afbeelding: { url: 'https://x/icm_stilte.png' } },
			{ afbeelding: { url: 'https://x/icm_stilte.png' }, type: 'STILTE' }
		];
		expect(bakIndeling(bakken)).toEqual([
			{ eersteKlas: true, stilte: false, drukte: undefined },
			{ eersteKlas: false, stilte: false, drukte: undefined },
			{ eersteKlas: false, stilte: true, drukte: undefined }
		]);
	});

	it('benoemt stilte per treinstel als de indeling per bak ontbreekt', () => {
		const advies = berekenInstapadvies({
			ritnummer: '2',
			delen: [
				{ faciliteiten: ['STILTE'], bakken: 4 },
				{ faciliteiten: ['TOILET'], bakken: 3 }
			],
			ingekort: false,
			rijrichting: 'links',
			eersteKlasPerDeel: [true, true],
			ruw: null
		});
		expect(advies?.stilte).toEqual([]);
		expect(advies?.eersteKlas).toEqual([]);
		expect(advies?.nauwkeurig).toBe(false);
		expect(advies?.samenvatting).toEqual([
			'Eerste klas: in het voorste treinstel en in het achterste treinstel',
			'Stiltecoupé: in het voorste treinstel'
		]);
	});
});

describe('Firestore-waarden', () => {
	it('codeert en decodeert geneste data', () => {
		const data = { a: 1, b: 1.5, c: 'x', d: [{ e: true }], f: null, g: new Tijdstempel('2026-09-25T10:00:00Z') };
		const velden = naarVelden(data);
		expect(velden.a).toEqual({ integerValue: '1' });
		expect(velden.g).toEqual({ timestampValue: '2026-09-25T10:00:00Z' });
		expect(vanVelden(velden)).toEqual({ ...data, g: '2026-09-25T10:00:00Z' });
	});
});

describe('planner', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('valt na 4 s zonder antwoord van Transitous terug op NS, met melding', async () => {
		vi.useFakeTimers();
		const nsTrip = {
			trips: [
				{
					transfers: 0,
					legs: [
						{
							travelType: 'PUBLIC_TRANSIT',
							product: { number: '800', type: 'TRAIN', operatorName: 'NS', shortCategoryName: 'IC' },
							origin: { name: 'Utrecht Centraal', lat: 52.08, lng: 5.11, plannedDateTime: '2026-09-25T10:00:00+0200' },
							destination: { name: 'Zwolle', lat: 52.5, lng: 6.09, plannedDateTime: '2026-09-25T10:50:00+0200' },
							stops: []
						}
					]
				}
			]
		};
		vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
			if (url.includes('transitous')) {
				// Hangt tot de timeout de aanvraag afbreekt
				return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
			}
			if (url.includes('/stations')) return Promise.resolve(new Response(JSON.stringify({ payload: [] })));
			if (url.includes('/trips')) return Promise.resolve(new Response(JSON.stringify(nsTrip)));
			return Promise.resolve(new Response('{}', { status: 404 }));
		});
		const belofte = plan(
			{ van: { naam: 'Utrecht Centraal', lat: 52.08, lon: 5.11, type: 'station' }, naar: { naam: 'Zwolle', lat: 52.5, lon: 6.09, type: 'station' }, voorkeur: 'snelst' },
			{ nsKey: 'test' }
		);
		await vi.advanceTimersByTimeAsync(4100);
		await vi.advanceTimersByTimeAsync(3000);
		const r = await belofte;
		expect(r.bron).toBe('ns');
		expect(r.melding).toContain('4 seconden');
		expect(r.adviezen).toHaveLength(1);
	});

	it('sorteert op voorkeur', () => {
		const snel = maakAdvies([ovLeg('A', 'B', '10:10', '10:40')]);
		const traagDirect = maakAdvies([ovLeg('A', 'B', '10:00', '10:50')]);
		const metOverstap = maakAdvies([ovLeg('A', 'C', '10:05', '10:15'), ovLeg('C', 'B', '10:20', '10:35')]);
		expect(sorteer([traagDirect, snel, metOverstap], 'snelst')[0]).toBe(metOverstap);
		expect(sorteer([metOverstap, traagDirect, snel], 'overstappen')[0]).toBe(snel);
	});

	it('kiest de laatste verbinding die nog niet vertrokken is', () => {
		const vroeg = maakAdvies([ovLeg('A', 'B', '23:00', '23:40')]);
		const laat = maakAdvies([ovLeg('A', 'B', '23:50', '00:30')]);
		expect(kiesLaatste([vroeg, laat], Date.parse(t('22:00')))).toBe(laat);
		expect(kiesLaatste([vroeg, laat], Date.parse(t('23:55')))).toBeUndefined();
	});
});

describe('beheerders en Gmail-adressen', async () => {
	const { beheerders, isBeheerder, normaliseerEmail } = await import('./auth');

	it('negeert puntjes en +labels bij Gmail', () => {
		expect(normaliseerEmail('Kleijnen.Lars@gmail.com')).toBe('kleijnenlars@gmail.com');
		expect(normaliseerEmail('kleijnenlars+ov@googlemail.com')).toBe('kleijnenlars@gmail.com');
		expect(normaliseerEmail('jan.de.vries@outlook.com')).toBe('jan.de.vries@outlook.com');
	});

	it('leest ADMIN_EMAILS tolerant', () => {
		expect(beheerders('"Kleijnen.lars@gmail.com"')).toEqual(['kleijnenlars@gmail.com']);
		expect(beheerders('ADMIN_EMAILS=a@b.nl, Lars <kleijnen.lars@gmail.com>')).toEqual(['a@b.nl', 'kleijnenlars@gmail.com']);
		expect(beheerders(undefined)).toEqual([]);
	});

	it('herkent de beheerder ongeacht puntjes', () => {
		const admins = beheerders('kleijnen.lars@gmail.com');
		expect(isBeheerder('kleijnenlars@gmail.com', admins)).toBe(true);
		expect(isBeheerder('iemand@gmail.com', admins)).toBe(false);
	});
});
