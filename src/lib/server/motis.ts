// Client voor Transitous (MOTIS 2 API) en omzetting naar het eigen datamodel.
// Documentatie: https://transitous.org/api/ en de OpenAPI-spec van MOTIS.

import type { Advies, Halte, Leg, Melding, Modus, Plek, Vertrek } from '../types';
import { adviesId, herbereken } from '../reis';
import { motisModi, type Reisopties } from '../reisopties';
import { ApiFout, haalJson, queryString } from './http';
import { codeerPolyline, decodeerPolyline } from '../geo';

export const TRANSITOUS = 'https://api.transitous.org';
// Transitous vraagt om een User-Agent met appnaam, versie en contact.
export const USER_AGENT = 'BetterOV/0.1 (+https://github.com/LKleijnen/BetterOV)';

// Transitous draait een recente MOTIS-release (v6-endpoints). Bij 404 vallen we terug op v5.
let apiVersie = 'v6';

async function motis<T>(pad: string, params: Record<string, unknown>, timeoutMs: number, versie = true): Promise<T> {
	const qs = queryString(params as Record<string, string>);
	const url = `${TRANSITOUS}/api/${versie ? apiVersie : 'v1'}/${pad}?${qs}`;
	try {
		return await haalJson<T>(url, { timeoutMs, headers: { 'user-agent': USER_AGENT }, bron: 'transitous' });
	} catch (e) {
		if (versie && e instanceof ApiFout && e.status === 404 && apiVersie === 'v6' && pad === 'plan') {
			// Alleen bij plannen: een 404 op /trip kan ook "rit niet gevonden" betekenen
			apiVersie = 'v5';
			return motis<T>(pad, params, timeoutMs, versie);
		}
		throw e;
	}
}

// ---------- Ruwe MOTIS-types (alleen de velden die we gebruiken) ----------

interface MPlace {
	name: string;
	stopId?: string;
	lat: number;
	lon: number;
	arrival?: string;
	departure?: string;
	scheduledArrival?: string;
	scheduledDeparture?: string;
	scheduledTrack?: string;
	track?: string;
	cancelled?: boolean;
	alerts?: MAlert[];
}

interface MAlert {
	headerText: string;
	descriptionText: string;
	url?: string;
	severityLevel?: string;
}

interface MLeg {
	mode: string;
	from: MPlace;
	to: MPlace;
	duration: number;
	startTime: string;
	endTime: string;
	scheduledStartTime: string;
	scheduledEndTime: string;
	realTime: boolean;
	distance?: number;
	headsign?: string;
	tripTo?: MPlace;
	category?: { id: string; name: string; shortName: string };
	routeColor?: string;
	routeTextColor?: string;
	agencyName?: string;
	tripId?: string;
	routeShortName?: string;
	routeLongName?: string;
	tripShortName?: string;
	displayName?: string;
	cancelled?: boolean;
	intermediateStops?: MPlace[];
	legGeometry?: { points: string; precision: number; length: number };
	alerts?: MAlert[];
	bikesAllowed?: boolean;
	wheelchairAccessible?: string;
}

interface MItinerary {
	id?: string;
	duration: number;
	startTime: string;
	endTime: string;
	transfers: number;
	legs: MLeg[];
}

interface MPlan {
	itineraries: MItinerary[];
	direct?: MItinerary[];
	previousPageCursor?: string;
	nextPageCursor?: string;
}

interface MStopTime {
	place: MPlace;
	mode: string;
	realTime: boolean;
	headsign: string;
	tripTo?: MPlace;
	agencyName: string;
	routeColor?: string;
	routeTextColor?: string;
	tripId: string;
	routeShortName: string;
	routeLongName?: string;
	tripShortName?: string;
	displayName?: string;
	category?: { id: string; name: string; shortName: string };
	cancelled: boolean;
	tripCancelled: boolean;
}

interface MMatch {
	type: 'ADDRESS' | 'PLACE' | 'STOP';
	category?: string;
	name: string;
	id: string;
	lat: number;
	lon: number;
	street?: string;
	houseNumber?: string;
	country?: string;
	zip?: string;
	areas?: { name: string; adminLevel: number; matched: boolean; default?: boolean }[];
	modes?: string[];
	importance?: number;
}

// ---------- Omzetting ----------

const TREIN_MODI = [
	'RAIL',
	'HIGHSPEED_RAIL',
	'LONG_DISTANCE',
	'NIGHT_RAIL',
	'REGIONAL_FAST_RAIL',
	'REGIONAL_RAIL',
	'SUBURBAN'
];

export function modusVan(mode: string): Modus {
	if (TREIN_MODI.includes(mode)) return 'trein';
	if (mode === 'BUS' || mode === 'COACH') return 'bus';
	if (mode === 'TRAM') return 'tram';
	if (mode === 'SUBWAY' || mode === 'METRO') return 'metro';
	if (mode === 'FERRY') return 'veer';
	if (mode === 'WALK') return 'lopen';
	if (mode === 'BIKE' || mode === 'RENTAL') return 'fiets';
	if (mode.startsWith('CAR') || mode === 'ODM' || mode === 'RIDE_SHARING') return 'auto';
	return 'overig';
}

export function isNSVervoerder(naam?: string): boolean {
	return !!naam && /^(NS\b|NS International|Nederlandse Spoorwegen)/i.test(naam.trim());
}

const TREINPRODUCTEN: Record<string, string> = {
	IC: 'Intercity',
	ICD: 'Intercity direct',
	SPR: 'Sprinter',
	ST: 'Stoptrein',
	SNT: 'Nachttrein',
	ICE: 'ICE',
	EST: 'Eurostar',
	ES: 'Eurostar',
	THA: 'Eurostar',
	NJ: 'Nightjet',
	EC: 'Eurocity',
	ECD: 'Eurocity direct',
	RE: 'Regional-Express',
	RB: 'Regionalbahn',
	S: 'S-Bahn',
	SNEL: 'Sneltrein'
};

/** Lijncode zoals RS18, RE 19 of S3 (geen ritnummer, geen productafkorting) */
function isLijncode(x: string | undefined): x is string {
	return !!x && /^[A-Z]{1,4} ?\d{1,3}[A-Z]?$/i.test(x.trim()) && !TREINPRODUCTEN[x.trim().toUpperCase()];
}

/** Product (Intercity, Stoptrein, …) en korte lijnaanduiding voor het label, zonder dubbelingen */
export function treinProduct(l: { category?: { name: string; shortName: string }; routeShortName?: string; routeLongName?: string; displayName?: string }): { productNaam: string; lijn?: string } {
	const kandidaten = [l.category?.shortName, l.category?.name, l.routeShortName, l.routeLongName, l.displayName]
		.filter((x): x is string => !!x)
		.map((x) => x.trim());
	let product: { productNaam: string; afk?: string; rest?: string } | undefined;
	for (const k of kandidaten) {
		const woorden = k.split(/\s+/);
		const eersteWoord = woorden[0].toUpperCase();
		if (TREINPRODUCTEN[eersteWoord]) {
			product = { productNaam: TREINPRODUCTEN[eersteWoord], afk: eersteWoord, rest: woorden.slice(1).join(' ') };
			break;
		}
		// Volledige naam, eventueel met een lijncode erachter ("Stoptrein RS18")
		const naam = Object.values(TREINPRODUCTEN).find(
			(p) => k.toLowerCase() === p.toLowerCase() || k.toLowerCase().startsWith(`${p.toLowerCase()} `)
		);
		if (naam) {
			product = { productNaam: naam, afk: Object.keys(TREINPRODUCTEN).find((a) => TREINPRODUCTEN[a] === naam), rest: k.slice(naam.length).trim() };
			break;
		}
	}
	// Een echte lijncode (RS18) zegt meer dan de productafkorting (ST)
	const lijncode = [l.routeShortName, product?.rest, l.displayName?.split(/\s+/).slice(1).join(' ')].find(isLijncode);
	if (product) return { productNaam: product.productNaam, lijn: lijncode?.trim() ?? product.afk };
	const eerste = kandidaten.find((k) => !/^\d+$/.test(k));
	return { productNaam: eerste ?? 'Trein', lijn: lijncode?.trim() ?? eerste };
}

function ritnummerVan(l: { tripShortName?: string; displayName?: string }): string | undefined {
	if (l.tripShortName && /^\d{1,6}$/.test(l.tripShortName.trim())) return l.tripShortName.trim();
	const m = (l.displayName ?? '').match(/(\d{2,6})\s*$/);
	return m?.[1];
}

function kleur(k?: string): string | undefined {
	if (!k) return undefined;
	return k.startsWith('#') ? k : `#${k}`;
}

function tijd(gepland?: string, verwacht?: string): { gepland: string; verwacht: string } | undefined {
	const g = gepland ?? verwacht;
	const v = verwacht ?? gepland;
	return g && v ? { gepland: g, verwacht: v } : undefined;
}

function melding(a: MAlert): Melding {
	return {
		kop: a.headerText,
		tekst: a.descriptionText || undefined,
		url: a.url,
		ernst: a.severityLevel === 'SEVERE' ? 'ernstig' : a.severityLevel === 'WARNING' ? 'waarschuwing' : 'info'
	};
}

function halte(p: MPlace): Halte {
	return {
		naam: p.name,
		lat: p.lat,
		lon: p.lon,
		stopId: p.stopId,
		aankomst: tijd(p.scheduledArrival, p.arrival),
		vertrek: tijd(p.scheduledDeparture, p.departure),
		geplandSpoor: p.scheduledTrack,
		spoor: p.track ?? p.scheduledTrack,
		uitgevallen: p.cancelled || undefined
	};
}

export function normaliseerLeg(l: MLeg): Leg {
	const modus = modusVan(l.mode);
	const trein = modus === 'trein' ? treinProduct(l) : undefined;
	const productNaam =
		trein?.productNaam ??
		({ bus: 'Bus', tram: 'Tram', metro: 'Metro', veer: 'Veerboot' } as Record<string, string>)[modus];
	const lijn = trein ? trein.lijn : l.routeShortName || l.displayName;
	const meldingen = [...(l.alerts ?? []), ...(l.from.alerts ?? [])].map(melding);
	return {
		modus,
		van: halte(l.from),
		naar: halte(l.to),
		vertrek: { gepland: l.scheduledStartTime, verwacht: l.startTime },
		aankomst: { gepland: l.scheduledEndTime, verwacht: l.endTime },
		duur: l.duration,
		tussenstops: (l.intermediateStops ?? []).map(halte),
		lijn,
		productNaam,
		richting: l.headsign || l.tripTo?.name,
		vervoerder: l.agencyName,
		ritnummer: modus === 'trein' ? ritnummerVan(l) : undefined,
		tripId: l.tripId,
		realtime: l.realTime,
		uitgevallen: !!l.cancelled,
		isNS: modus === 'trein' && isNSVervoerder(l.agencyName),
		polyline: l.legGeometry?.points ? { punten: l.legGeometry.points, precisie: l.legGeometry.precision } : undefined,
		afstand: l.distance,
		kleur: kleur(l.routeColor),
		tekstKleur: kleur(l.routeTextColor),
		meldingen: dedupe(meldingen),
		rolstoel:
			l.wheelchairAccessible === 'ACCESSIBLE' ? true : l.wheelchairAccessible === 'NOT_ACCESSIBLE' ? false : undefined,
		fietsen: l.bikesAllowed
	};
}

function dedupe(m: Melding[]): Melding[] {
	const gezien = new Set<string>();
	return m.filter((x) => {
		const k = x.kop + '|' + (x.tekst ?? '');
		if (gezien.has(k)) return false;
		gezien.add(k);
		return true;
	});
}

const PLAATSHOUDERS = new Set(['START', 'END', 'Start', 'End', '']);

export function normaliseerItinerary(it: MItinerary, van?: Plek, naar?: Plek): Advies {
	const legs = it.legs.map(normaliseerLeg);
	if (legs.length > 0) {
		const eerste = legs[0];
		if (van && (PLAATSHOUDERS.has(eerste.van.naam) || (!eerste.van.stopId && !isOVLeg(eerste)))) {
			eerste.van.naam = van.naam;
		}
		const laatste = legs[legs.length - 1];
		if (naar && (PLAATSHOUDERS.has(laatste.naar.naam) || (!laatste.naar.stopId && !isOVLeg(laatste)))) {
			laatste.naar.naam = naar.naam;
		}
	}
	const advies: Advies = {
		id: adviesId(legs),
		bron: 'transitous',
		vertrek: legs[0]?.vertrek ?? { gepland: it.startTime, verwacht: it.startTime },
		aankomst: legs[legs.length - 1]?.aankomst ?? { gepland: it.endTime, verwacht: it.endTime },
		duur: it.duration,
		overstappen: it.transfers,
		legs
	};
	return herbereken(advies);
}

function isOVLeg(l: Leg) {
	return l.modus !== 'lopen' && l.modus !== 'fiets' && l.modus !== 'auto';
}

// ---------- Endpoints ----------

export function plekParam(p: Plek): string {
	if (p.stopId && (p.type === 'halte' || p.type === 'station')) return p.stopId;
	return `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
}

export interface MotisPlanVraag {
	van: Plek;
	naar: Plek;
	via?: Plek;
	tijd?: string;
	aankomst?: boolean;
	cursor?: string;
	aantal?: number;
	/** Zoekvenster in seconden */
	venster?: number;
	maxOverstappen?: number;
	opties?: Reisopties;
}

export async function motisPlan(
	v: MotisPlanVraag,
	timeoutMs = 10000
): Promise<{ adviezen: Advies[]; vorige?: string; volgende?: string }> {
	const params: Record<string, unknown> = {
		fromPlace: plekParam(v.van),
		toPlace: plekParam(v.naar),
		via: v.via?.stopId ? [v.via.stopId] : undefined,
		time: v.tijd,
		arriveBy: v.aankomst ? 'true' : undefined,
		pageCursor: v.cursor,
		numItineraries: v.aantal ?? 6,
		searchWindow: v.venster,
		maxTransfers: v.maxOverstappen,
		additionalTransferTime: v.opties?.extraOverstaptijd || undefined,
		transitModes: v.opties ? motisModi(v.opties) : undefined,
		pedestrianProfile: v.opties?.toegankelijk ? 'WHEELCHAIR' : undefined,
		language: 'nl',
		maxPreTransitTime: 1200,
		maxPostTransitTime: 1200
	};
	const plan = await motis<MPlan>('plan', params, timeoutMs);
	const alles = [...(v.cursor ? [] : (plan.direct ?? [])), ...plan.itineraries];
	const adviezen = alles
		.filter((it) => it.legs?.length > 0)
		.map((it) => normaliseerItinerary(it, v.van, v.naar));
	return { adviezen: uniek(adviezen), vorige: plan.previousPageCursor, volgende: plan.nextPageCursor };
}

function uniek(adviezen: Advies[]): Advies[] {
	const gezien = new Set<string>();
	return adviezen.filter((a) => {
		if (gezien.has(a.id)) return false;
		gezien.add(a.id);
		return true;
	});
}

/** Volledige rit (alle haltes) als één leg */
export async function motisRit(tripId: string, timeoutMs = 8000): Promise<Leg | null> {
	const it = await motis<MItinerary>('trip', { tripId, language: 'nl' }, timeoutMs);
	return voegRitSamen((it.legs ?? []).map(normaliseerLeg).filter(isOVLeg));
}

/** Aaneengesloten legs van één rit (bijvoorbeeld bij een lijnwissel zonder overstap) samenvoegen, ook de vorm */
export function voegRitSamen(legs: Leg[]): Leg | null {
	if (legs.length === 0) return null;
	if (legs.length === 1) return legs[0];
	const eerste = legs[0];
	const laatste = legs[legs.length - 1];
	const precisie = eerste.polyline?.precisie ?? 6;
	const vorm = legs.every((l) => l.polyline?.punten)
		? { punten: codeerPolyline(legs.flatMap((l) => decodeerPolyline(l.polyline!.punten, l.polyline!.precisie)), precisie), precisie }
		: undefined;
	return {
		...eerste,
		polyline: vorm,
		naar: laatste.naar,
		aankomst: laatste.aankomst,
		duur: Math.round((Date.parse(laatste.aankomst.verwacht) - Date.parse(eerste.vertrek.verwacht)) / 1000),
		tussenstops: legs.flatMap((l, i) => (i === 0 ? l.tussenstops : [l.van, ...l.tussenstops])),
		uitgevallen: legs.some((l) => l.uitgevallen),
		meldingen: dedupe(legs.flatMap((l) => l.meldingen))
	};
}

export interface MotisVertrekVraag {
	stopId?: string;
	lat?: number;
	lon?: number;
	straal?: number;
	tijd?: string;
	aantal?: number;
	cursor?: string;
}

export async function motisVertrektijden(
	v: MotisVertrekVraag,
	timeoutMs = 8000
): Promise<{ halte: { naam: string; stopId?: string; lat?: number; lon?: number }; vertrekken: Vertrek[]; volgende?: string }> {
	const params: Record<string, unknown> = {
		stopId: v.stopId,
		center: v.stopId ? undefined : `${v.lat},${v.lon}`,
		radius: v.stopId ? undefined : (v.straal ?? 400),
		time: v.tijd,
		n: v.aantal ?? 40,
		pageCursor: v.cursor,
		language: 'nl'
	};
	const r = await motis<{ stopTimes: MStopTime[]; place?: MPlace; nextPageCursor?: string }>(
		'stoptimes',
		params,
		timeoutMs
	);
	const vertrekken = (r.stopTimes ?? [])
		.filter((st) => st.place.departure || st.place.scheduledDeparture)
		.map((st): Vertrek => {
			const modus = modusVan(st.mode);
			const trein = modus === 'trein' ? treinProduct(st) : undefined;
			return {
				tijd: tijd(st.place.scheduledDeparture, st.place.departure)!,
				richting: st.headsign || st.tripTo?.name || '',
				lijn: trein?.lijn ?? (st.routeShortName || st.displayName || ''),
				productNaam:
					trein?.productNaam ??
					({ bus: 'Bus', tram: 'Tram', metro: 'Metro', veer: 'Veerboot' } as Record<string, string>)[modus],
				modus,
				vervoerder: st.agencyName,
				spoor: st.place.track ?? st.place.scheduledTrack,
				geplandSpoor: st.place.scheduledTrack,
				uitgevallen: st.cancelled || st.tripCancelled,
				realtime: st.realTime,
				tripId: st.tripId,
				ritnummer: modus === 'trein' ? ritnummerVan(st) : undefined,
				isNS: modus === 'trein' && isNSVervoerder(st.agencyName),
				kleur: kleur(st.routeColor),
				tekstKleur: kleur(st.routeTextColor),
				halteNaam: st.place.name,
				meldingen: dedupe((st.place.alerts ?? []).map(melding))
			};
		});
	return {
		halte: r.place
			? { naam: r.place.name, stopId: r.place.stopId, lat: r.place.lat, lon: r.place.lon }
			: { naam: vertrekken[0]?.halteNaam ?? 'Haltes in de buurt', lat: v.lat, lon: v.lon },
		vertrekken,
		volgende: r.nextPageCursor
	};
}

const TREIN_MODES_SET = new Set(TREIN_MODI);

function matchNaarPlek(m: MMatch): Plek {
	const plaats =
		m.areas?.find((a) => a.default)?.name ??
		m.areas?.find((a) => a.adminLevel === 8)?.name ??
		m.areas?.find((a) => a.adminLevel === 10)?.name ??
		m.areas?.[0]?.name;
	if (m.type === 'STOP') {
		const isStation = (m.modes ?? []).some((x) => TREIN_MODES_SET.has(x)) || m.category === 'railway_station';
		return {
			naam: m.name,
			lat: m.lat,
			lon: m.lon,
			stopId: m.id,
			type: isStation ? 'station' : 'halte',
			omschrijving: plaats && !m.name.toLowerCase().includes(plaats.toLowerCase()) ? plaats : undefined
		};
	}
	if (m.type === 'ADDRESS') {
		const straat = m.street ? `${m.street}${m.houseNumber ? ' ' + m.houseNumber : ''}` : m.name;
		return {
			naam: straat,
			lat: m.lat,
			lon: m.lon,
			type: 'adres',
			omschrijving: [m.zip, plaats].filter(Boolean).join(' ') || undefined
		};
	}
	return { naam: m.name, lat: m.lat, lon: m.lon, type: 'plek', omschrijving: plaats };
}

export async function motisZoek(
	tekst: string,
	bias?: { lat: number; lon: number },
	timeoutMs = 5000
): Promise<Plek[]> {
	const params = {
		text: tekst,
		language: 'nl',
		place: bias ? `${bias.lat},${bias.lon}` : '52.1,5.3',
		placeBias: bias ? 3 : 1
	};
	const r = await motis<MMatch[]>('geocode', params, timeoutMs, false);
	return r.slice(0, 12).map(matchNaarPlek);
}

export async function motisOmgekeerd(lat: number, lon: number, timeoutMs = 4000): Promise<Plek | null> {
	const r = await motis<MMatch[]>('reverse-geocode', { place: `${lat},${lon}` }, timeoutMs, false);
	const adres = r.find((m) => m.type === 'ADDRESS') ?? r[0];
	return adres ? matchNaarPlek(adres) : null;
}
