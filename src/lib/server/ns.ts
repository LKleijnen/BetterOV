// Client voor de NS API (apiportal.ns.nl): fallback-planner, vertrektijden,
// ritinformatie (drukte, materieel), treinsamenstelling, posities en prijzen.
// NS-antwoorden worden defensief gelezen: ontbrekende velden leveren lege waarden op.

import type { Advies, Drukte, Halte, Leg, Melding, Modus, Plek, Tijd, TreinDeel, BakInfo, Vertrek, VoertuigPositie } from '../types';
import { adviesId, herbereken } from '../reis';
import { nsUitgeschakeld, type Reisopties } from '../reisopties';
import { afstandMeter, looptijdSeconden } from '../geo';
import { ApiFout, gecached, gedeeldGecached, gedeeldGecachedTekst, haalJson, haalTekst, queryString } from './http';

export const NS_BASIS = 'https://gateway.apiportal.ns.nl';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ruw = any;

async function ns<T = Ruw>(key: string | undefined, pad: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
	if (!key) throw new ApiFout('NS API-key is niet ingesteld', 0, 'ns');
	const qs = queryString(params as Record<string, string>);
	return haalJson<T>(`${NS_BASIS}${pad}${qs ? `?${qs}` : ''}`, {
		timeoutMs,
		headers: { 'Ocp-Apim-Subscription-Key': key },
		bron: 'ns'
	});
}

/** NS-tijden als "2026-09-25T18:30:00+0200" omzetten naar geldige ISO ("+02:00") */
export function nsTijd(s?: string | null): string | undefined {
	if (!s) return undefined;
	return s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

function tijd(gepland?: string, verwacht?: string): Tijd | undefined {
	const g = nsTijd(gepland) ?? nsTijd(verwacht);
	const v = nsTijd(verwacht) ?? g;
	return g && v ? { gepland: g, verwacht: v } : undefined;
}

export function nsDrukte(x?: string | null): Drukte | undefined {
	switch ((x ?? '').toUpperCase()) {
		case 'LOW':
			return 'laag';
		case 'MEDIUM':
			return 'gemiddeld';
		case 'HIGH':
			return 'hoog';
		case 'UNKNOWN':
			return 'onbekend';
		default:
			return undefined;
	}
}

// ---------- Stations ----------

export interface NsStation {
	code: string;
	uic: string;
	naam: string;
	middel?: string;
	kort?: string;
	lat: number;
	lon: number;
	land?: string;
	synoniemen: string[];
}

export async function nsStations(key: string | undefined): Promise<NsStation[]> {
	if (!key) return [];
	return gedeeldGecached('ns-stations-v2', 86400, async () => {
		const r = await ns(key, '/reisinformatie-api/api/v2/stations', {}, 10000);
		const lijst: Ruw[] = Array.isArray(r?.payload) ? r.payload : [];
		return lijst
			.filter((s) => typeof s?.lat === 'number' && typeof s?.lng === 'number')
			.map(
				(s): NsStation => ({
					code: String(s.code ?? '').toUpperCase(),
					uic: String(s.UICCode ?? s.uicCode ?? ''),
					naam: s.namen?.lang ?? s.code,
					middel: s.namen?.middel,
					kort: s.namen?.kort,
					lat: s.lat,
					lon: s.lng,
					land: s.land,
					synoniemen: Array.isArray(s.synoniemen) ? s.synoniemen : []
				})
			);
	});
}

function normaliseerNaam(n: string): string {
	return n
		.toLowerCase()
		.replace(/^station\s+/, '')
		.replace(/[.,'’()-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function stationOpNaam(stations: NsStation[], naam: string): NsStation | undefined {
	const doel = normaliseerNaam(naam);
	return stations.find((s) =>
		[s.naam, s.middel, s.kort, s.code, ...s.synoniemen].some((n) => n && normaliseerNaam(n) === doel)
	);
}

export function dichtstbijzijndStation(stations: NsStation[], lat: number, lon: number, maxMeter = 400): NsStation | undefined {
	let beste: NsStation | undefined;
	let besteAfstand = maxMeter;
	for (const s of stations) {
		const d = afstandMeter(lat, lon, s.lat, s.lon);
		if (d <= besteAfstand) {
			besteAfstand = d;
			beste = s;
		}
	}
	return beste;
}

/** Het NS-station dat bij een plek hoort, als de plek een station is of er vlakbij ligt */
export function stationVoorPlek(stations: NsStation[], p: Plek | undefined, maxMeter = 250): NsStation | undefined {
	if (!p) return undefined;
	const opNaam = stationOpNaam(stations, p.naam);
	if (opNaam && afstandMeter(p.lat, p.lon, opNaam.lat, opNaam.lon) < 1500) return opNaam;
	const straal = p.type === 'station' ? 600 : maxMeter;
	return dichtstbijzijndStation(stations, p.lat, p.lon, straal);
}

// ---------- Reisadvies (fallback-planner) ----------

function nsModus(l: Ruw): Modus {
	const reistype = String(l?.travelType ?? '').toUpperCase();
	const product = String(l?.product?.type ?? '').toUpperCase();
	if (reistype === 'WALK' || product === 'WALK') return 'lopen';
	if (reistype === 'BIKE' || product === 'BIKE') return 'fiets';
	if (['CAR', 'TAXI', 'KISS'].includes(reistype) || ['CAR', 'TAXI'].includes(product)) return 'auto';
	if (product === 'BUS') return 'bus';
	if (product === 'TRAM') return 'tram';
	if (product === 'METRO' || product === 'SUBWAY') return 'metro';
	if (product === 'FERRY' || product === 'SHIP') return 'veer';
	return 'trein';
}

function isNSOperator(o?: string): boolean {
	return !!o && /^(NS\b|NS International|Nederlandse Spoorwegen)/i.test(o.trim());
}

function nsStop(s: Ruw, spoorVan: 'Departure' | 'Arrival' = 'Departure'): Halte {
	const andere = spoorVan === 'Departure' ? 'Arrival' : 'Departure';
	return {
		naam: s?.name ?? '',
		lat: s?.lat ?? 0,
		lon: s?.lng ?? 0,
		aankomst: tijd(s?.plannedArrivalDateTime, s?.actualArrivalDateTime),
		vertrek: tijd(s?.plannedDepartureDateTime, s?.actualDepartureDateTime),
		geplandSpoor: s?.[`planned${spoorVan}Track`] ?? s?.[`planned${andere}Track`],
		spoor:
			s?.[`actual${spoorVan}Track`] ??
			s?.[`planned${spoorVan}Track`] ??
			s?.[`actual${andere}Track`] ??
			s?.[`planned${andere}Track`],
		uitgevallen: s?.cancelled || undefined
	};
}

function nsMeldingen(l: Ruw): Melding[] {
	const uit: Melding[] = [];
	for (const m of l?.messages ?? []) {
		const kop = m?.head ?? m?.text ?? m?.message;
		if (kop) uit.push({ kop, tekst: m?.lead ?? (m?.text !== kop ? m?.text : undefined), ernst: m?.type === 'DISRUPTION' ? 'waarschuwing' : 'info' });
	}
	for (const m of l?.transferMessages ?? []) {
		const kop = m?.message ?? m?.accessibilityMessage;
		if (kop) uit.push({ kop, ernst: m?.type === 'CHANGE_NOT_POSSIBLE' ? 'ernstig' : 'info' });
	}
	return uit;
}

export function nsLeg(l: Ruw): Leg {
	const modus = nsModus(l);
	const product = l?.product ?? {};
	const o = l?.origin ?? {};
	const d = l?.destination ?? {};
	const vertrek = tijd(o.plannedDateTime, o.actualDateTime) ?? { gepland: '', verwacht: '' };
	const aankomst = tijd(d.plannedDateTime, d.actualDateTime) ?? vertrek;
	const stops: Ruw[] = (l?.stops ?? []).filter((s: Ruw) => !s?.passing);
	const operator = product.operatorName ?? product.operatorCode;
	const trein = modus === 'trein';
	const lijnnummer =
		product.lineNumber ?? (typeof product.displayName === 'string' ? product.displayName.match(/(\w*\d+\w*)\s*$/)?.[1] : undefined);
	const duur =
		typeof l?.plannedDurationInMinutes === 'number' && !l?.actualDurationInMinutes
			? l.plannedDurationInMinutes * 60
			: Math.max(0, Math.round((Date.parse(aankomst.verwacht) - Date.parse(vertrek.verwacht)) / 1000));
	return {
		modus,
		van: {
			naam: o.name ?? '',
			lat: o.lat ?? 0,
			lon: o.lng ?? 0,
			vertrek,
			geplandSpoor: o.plannedTrack,
			spoor: o.actualTrack ?? o.plannedTrack,
			uitgevallen: o.cancelled || undefined
		},
		naar: {
			naam: d.name ?? '',
			lat: d.lat ?? 0,
			lon: d.lng ?? 0,
			aankomst,
			geplandSpoor: d.plannedTrack,
			spoor: d.actualTrack ?? d.plannedTrack,
			uitgevallen: d.cancelled || undefined
		},
		vertrek,
		aankomst,
		duur,
		tussenstops: stops.slice(1, -1).map((s) => nsStop(s)),
		lijn: trein ? (product.shortCategoryName ?? product.categoryCode) : lijnnummer ? String(lijnnummer) : undefined,
		productNaam: trein
			? (product.longCategoryName ?? l?.name ?? 'Trein')
			: ({ bus: 'Bus', tram: 'Tram', metro: 'Metro', veer: 'Veerboot' } as Record<string, string>)[modus],
		richting: l?.direction,
		vervoerder: operator,
		ritnummer: trein && product.number ? String(product.number) : undefined,
		realtime: !!(o.actualDateTime || d.actualDateTime),
		uitgevallen: !!l?.cancelled,
		isNS: trein && isNSOperator(operator),
		afstand: typeof l?.distance === 'number' ? l.distance : undefined,
		meldingen: nsMeldingen(l),
		drukte: nsDrukte(l?.crowdForecast)
	};
}

export function nsTripNaarAdvies(t: Ruw, van?: Plek, naar?: Plek): Advies {
	const legs: Leg[] = (t?.legs ?? []).map(nsLeg).filter((l: Leg) => l.vertrek.gepland);
	if (legs.length > 0) {
		if (van && !legs[0].van.naam) legs[0].van.naam = van.naam;
		if (naar && !legs[legs.length - 1].naar.naam) legs[legs.length - 1].naar.naam = naar.naam;
	}
	const meldingen: Melding[] = [];
	const status = String(t?.status ?? '').toUpperCase();
	if (status === 'CANCELLED') meldingen.push({ kop: 'Deze reis gaat niet door', ernst: 'ernstig' });
	if (status === 'CHANGE_NOT_POSSIBLE') meldingen.push({ kop: 'Overstap niet mogelijk', ernst: 'ernstig' });
	if (status === 'ALTERNATIVE_TRANSPORT') meldingen.push({ kop: 'Vervangend vervoer', ernst: 'waarschuwing' });
	const advies: Advies = {
		id: adviesId(legs),
		bron: 'ns',
		vertrek: legs[0]?.vertrek ?? { gepland: '', verwacht: '' },
		aankomst: legs[legs.length - 1]?.aankomst ?? { gepland: '', verwacht: '' },
		duur: 0,
		overstappen: typeof t?.transfers === 'number' ? t.transfers : 0,
		legs,
		meldingen: meldingen.length ? meldingen : undefined
	};
	const prijsCent = t?.productFare?.priceInCents ?? t?.productFare?.buyableTicketPriceInCents;
	if (typeof prijsCent === 'number' && legs.every((l) => l.modus !== 'bus' && l.modus !== 'tram' && l.modus !== 'metro')) {
		advies.prijs = {
			bedrag: prijsCent,
			exact: true,
			onderdelen: [{ omschrijving: 'Trein, 2e klas, vol tarief', bedrag: prijsCent, exact: true }]
		};
	}
	return herbereken(advies);
}

/** Voegt looplegs toe als het advies bij een station begint of eindigt maar de reiziger ergens anders is */
function metLooplegs(advies: Advies, van: Plek, naar: Plek): Advies {
	const legs = [...advies.legs];
	const eerste = legs[0];
	if (eerste && afstandMeter(van.lat, van.lon, eerste.van.lat, eerste.van.lon) > 150) {
		const sec = looptijdSeconden(van.lat, van.lon, eerste.van.lat, eerste.van.lon);
		const eind = eerste.vertrek.verwacht;
		const start = new Date(Date.parse(eind) - sec * 1000).toISOString();
		legs.unshift({
			modus: 'lopen',
			van: { naam: van.naam, lat: van.lat, lon: van.lon },
			naar: { naam: eerste.van.naam, lat: eerste.van.lat, lon: eerste.van.lon },
			vertrek: { gepland: start, verwacht: start },
			aankomst: { gepland: eind, verwacht: eind },
			duur: sec,
			tussenstops: [],
			realtime: false,
			uitgevallen: false,
			isNS: false,
			meldingen: []
		});
	}
	const laatste = legs[legs.length - 1];
	if (laatste && afstandMeter(naar.lat, naar.lon, laatste.naar.lat, laatste.naar.lon) > 150) {
		const sec = looptijdSeconden(laatste.naar.lat, laatste.naar.lon, naar.lat, naar.lon);
		const start = laatste.aankomst.verwacht;
		const eind = new Date(Date.parse(start) + sec * 1000).toISOString();
		legs.push({
			modus: 'lopen',
			van: { naam: laatste.naar.naam, lat: laatste.naar.lat, lon: laatste.naar.lon },
			naar: { naam: naar.naam, lat: naar.lat, lon: naar.lon },
			vertrek: { gepland: start, verwacht: start },
			aankomst: { gepland: eind, verwacht: eind },
			duur: sec,
			tussenstops: [],
			realtime: false,
			uitgevallen: false,
			isNS: false,
			meldingen: []
		});
	}
	return herbereken({ ...advies, legs, id: adviesId(legs) });
}

export interface NsPlanVraag {
	van: Plek;
	naar: Plek;
	via?: Plek;
	tijd?: string;
	aankomst?: boolean;
	context?: string;
	opties?: Reisopties;
}

/** Reisopties als NS-parameters (niet officieel gedocumenteerd; de app filtert de uitkomst ook zelf) */
function nsOptieParams(o: Reisopties | undefined): Record<string, unknown> {
	if (!o) return {};
	const uit = nsUitgeschakeld(o);
	return {
		addChangeTime: o.extraOverstaptijd || undefined,
		excludeTrainsWithReservationRequired: o.zonderReservering ? 'true' : undefined,
		disabledTransportModalities: uit.length ? uit : undefined,
		searchForAccessibleTrip: o.toegankelijk ? 'true' : undefined
	};
}

export async function nsPlan(
	key: string | undefined,
	v: NsPlanVraag,
	timeoutMs = 8000
): Promise<{ adviezen: Advies[]; vorige?: string; volgende?: string }> {
	const stations = await nsStations(key).catch(() => [] as NsStation[]);
	const basis: Record<string, unknown> = { lang: 'nl' };
	if (v.tijd) basis.dateTime = v.tijd;
	if (v.aankomst) basis.searchForArrival = 'true';
	if (v.context) basis.context = v.context;
	const viaStation = stationVoorPlek(stations, v.via, 600);
	if (viaStation) basis.viaStation = viaStation.code;

	const vanStation = stationVoorPlek(stations, v.van);
	const naarStation = stationVoorPlek(stations, v.naar);

	// Eerst deur-tot-deur met coördinaten; lukt dat niet, dan via de dichtstbijzijnde stations.
	const deurTotDeur: Record<string, unknown> = { ...basis };
	if (vanStation) deurTotDeur.fromStation = vanStation.code;
	else Object.assign(deurTotDeur, { originLat: v.van.lat, originLng: v.van.lon, originName: v.van.naam });
	if (naarStation) deurTotDeur.toStation = naarStation.code;
	else Object.assign(deurTotDeur, { destinationLat: v.naar.lat, destinationLng: v.naar.lon, destinationName: v.naar.naam });

	let r: Ruw;
	let viaStations = false;
	// Met opties; kent NS een optie niet (HTTP 400), dan zonder en filteren we zelf
	const opties = nsOptieParams(v.opties);
	const haalTrips = async (params: Record<string, unknown>) => {
		try {
			return await ns(key, '/reisinformatie-api/api/v3/trips', { ...params, ...opties }, timeoutMs);
		} catch (e) {
			if (e instanceof ApiFout && e.status === 400 && Object.values(opties).some((x) => x !== undefined)) {
				return ns(key, '/reisinformatie-api/api/v3/trips', params, timeoutMs);
			}
			throw e;
		}
	};
	try {
		r = await haalTrips(deurTotDeur);
	} catch (e) {
		if (vanStation && naarStation) throw e;
		const van = vanStation ?? dichtstbijzijndStation(stations, v.van.lat, v.van.lon, 8000);
		const naar = naarStation ?? dichtstbijzijndStation(stations, v.naar.lat, v.naar.lon, 8000);
		if (!van || !naar) throw e;
		r = await haalTrips({ ...basis, fromStation: van.code, toStation: naar.code });
		viaStations = true;
	}
	const trips: Ruw[] = Array.isArray(r?.trips) ? r.trips : [];
	let adviezen = trips.map((t) => nsTripNaarAdvies(t, v.van, v.naar)).filter((a) => a.legs.length > 0);
	if (viaStations) adviezen = adviezen.map((a) => metLooplegs(a, v.van, v.naar));
	return {
		adviezen,
		vorige: r?.scrollRequestBackwardContext,
		volgende: r?.scrollRequestForwardContext
	};
}

// ---------- Vertrektijden ----------

export async function nsVertrektijden(key: string | undefined, stationCode: string, timeoutMs = 6000): Promise<Vertrek[]> {
	const r = await ns(key, '/reisinformatie-api/api/v2/departures', { station: stationCode, lang: 'nl', maxJourneys: 40 }, timeoutMs);
	const lijst: Ruw[] = r?.payload?.departures ?? [];
	return lijst.map((d): Vertrek => {
		const operator = d?.product?.operatorName;
		return {
			tijd: tijd(d?.plannedDateTime, d?.actualDateTime) ?? { gepland: '', verwacht: '' },
			richting: d?.direction ?? '',
			lijn: d?.product?.shortCategoryName ?? d?.trainCategory ?? '',
			productNaam: d?.product?.longCategoryName,
			modus: 'trein',
			vervoerder: operator,
			spoor: d?.actualTrack ?? d?.plannedTrack,
			geplandSpoor: d?.plannedTrack,
			uitgevallen: !!d?.cancelled,
			realtime: !!d?.actualDateTime,
			ritnummer: d?.product?.number ? String(d.product.number) : undefined,
			isNS: isNSOperator(operator),
			meldingen: (d?.messages ?? [])
				.filter((m: Ruw) => m?.message)
				.map((m: Ruw) => ({ kop: m.message, ernst: m?.style === 'WARNING' ? 'waarschuwing' : 'info' })),
			via: (d?.routeStations ?? []).map((s: Ruw) => s?.mediumName).filter(Boolean)
		};
	});
}

// ---------- Rit (journey): drukte en materieel per halte ----------

export interface NsRitHalte {
	/** Id van de halte binnen de rit (bijvoorbeeld "ASD_0"), om takken te volgen */
	id?: string;
	/** Id's van de volgende haltes: twee of meer als de trein hier splitst */
	volgende?: string[];
	code?: string;
	uic?: string;
	naam: string;
	lat: number;
	lon: number;
	status?: string;
	aankomst?: Tijd;
	vertrek?: Tijd;
	spoor?: string;
	geplandSpoor?: string;
	drukte?: Drukte;
	uitgevallen?: boolean;
	/** Vertrekken vanaf deze halte met hun bestemming en treinstellen (bij splitsen meer dan één) */
	vertrekken?: { naar?: string; ritnummer?: string; nummers: string[] }[];
	materieel?: {
		aantalDelen?: number;
		normaalDelen?: number;
		zitplaatsen?: number;
		type?: string;
		delen: { nummer?: string; type?: string; faciliteiten: string[]; afbeelding?: string }[];
	};
}

const alsLijst = (x: unknown): string[] =>
	(Array.isArray(x) ? x : x == null || x === '' ? [] : [x]).filter((y) => y != null && y !== '').map(String);

/** De ruwe ritdata van NS (journey), 45 s gecachet */
export async function nsRitRuw(key: string | undefined, ritnummer: string, datumTijd?: string): Promise<Ruw> {
	return gecached(`ns-rit-ruw:${ritnummer}:${datumTijd?.slice(0, 13) ?? ''}`, 45, () =>
		ns(key, '/reisinformatie-api/api/v2/journey', { train: ritnummer, dateTime: datumTijd, omitCrowdForecast: 'false' }, 7000)
	);
}

export function nsRitHaltes(r: Ruw): NsRitHalte[] {
	const stops: Ruw[] = r?.payload?.stops ?? [];
	return stops.map((s): NsRitHalte => {
		const aank = s?.arrivals?.[0];
		const vert = s?.departures?.[0];
		const stock = s?.actualStock;
		const gepland = s?.plannedStock;
		const naam = (x: Ruw): string | undefined => (typeof x === 'string' ? x : (x?.name ?? x?.mediumName ?? x?.longName)) || undefined;
		const vertrekken = (Array.isArray(s?.departures) ? s.departures : []).map((d: Ruw) => ({
			naar: naam(d?.destination) ?? naam(d?.direction),
			ritnummer: d?.product?.number != null ? String(d.product.number) : undefined,
			nummers: alsLijst(d?.stockIdentifiers)
		}));
		return {
			id: s?.id != null ? String(s.id) : undefined,
			volgende: alsLijst(s?.nextStopId),
			code: typeof s?.id === 'string' ? s.id.split('_')[0].toUpperCase() : undefined,
			uic: s?.stop?.uicCode ? String(s.stop.uicCode) : undefined,
			naam: s?.stop?.name ?? '',
			lat: s?.stop?.lat ?? 0,
			lon: s?.stop?.lng ?? 0,
			status: s?.status,
			aankomst: tijd(aank?.plannedTime, aank?.actualTime),
			vertrek: tijd(vert?.plannedTime, vert?.actualTime),
			spoor: vert?.actualTrack ?? vert?.plannedTrack ?? aank?.actualTrack ?? aank?.plannedTrack,
			geplandSpoor: vert?.plannedTrack ?? aank?.plannedTrack,
			drukte: nsDrukte(vert?.crowdForecast ?? aank?.crowdForecast),
			uitgevallen: (vert?.cancelled ?? aank?.cancelled) || undefined,
			vertrekken: vertrekken.length ? vertrekken : undefined,
			materieel: stock
				? {
						aantalDelen: stock.numberOfParts,
						normaalDelen: gepland?.numberOfParts,
						zitplaatsen: stock.numberOfSeats,
						type: stock.trainType,
						delen: (stock.trainParts ?? []).map((p: Ruw) => ({
							nummer: p?.stockIdentifier != null ? String(p.stockIdentifier) : undefined,
							type: p?.type ?? stock.trainType,
							faciliteiten: Array.isArray(p?.facilities) ? p.facilities : [],
							afbeelding: p?.image?.uri
						}))
					}
				: undefined
		};
	});
}

export async function nsRit(key: string | undefined, ritnummer: string, datumTijd?: string): Promise<NsRitHalte[]> {
	return nsRitHaltes(await nsRitRuw(key, ritnummer, datumTijd));
}

export function ritHalteBij(
	haltes: NsRitHalte[],
	zoek: { code?: string; naam?: string; lat?: number; lon?: number }
): NsRitHalte | undefined {
	if (zoek.code) {
		const h = haltes.find((x) => x.code === zoek.code!.toUpperCase());
		if (h) return h;
	}
	if (zoek.naam) {
		const doel = normaliseerNaam(zoek.naam);
		const h = haltes.find((x) => normaliseerNaam(x.naam) === doel);
		if (h) return h;
	}
	if (zoek.lat !== undefined && zoek.lon !== undefined) {
		let beste: NsRitHalte | undefined;
		let d = 800;
		for (const h of haltes) {
			const a = afstandMeter(zoek.lat, zoek.lon, h.lat, h.lon);
			if (a < d) {
				d = a;
				beste = h;
			}
		}
		return beste;
	}
	return undefined;
}

// ---------- Treinsamenstelling (Virtual Train API) ----------

export interface NsSamenstelling {
	ritnummer: string;
	station?: string;
	type?: string;
	vervoerder?: string;
	spoor?: string;
	delen: TreinDeel[];
	ingekort: boolean;
	lengteBakken?: number;
	lengteMeter?: number;
	rijrichting?: 'links' | 'rechts';
	zitplaatsen?: number;
	eersteKlasPerDeel: boolean[];
	ruw: unknown;
}

function tekstVelden(x: Ruw, diepte = 0): string[] {
	if (x == null || diepte > 3) return [];
	if (typeof x === 'string') return [x];
	if (Array.isArray(x)) return x.flatMap((y) => tekstVelden(y, diepte + 1));
	if (typeof x === 'object') {
		return Object.entries(x).flatMap(([k, v]) =>
			// Afbeeldingen en links overslaan: een bestandsnaam als ".../stilte.png" zegt niets over deze bak
			/afbeelding|image|url|uri|href|icon/i.test(k) ? [] : typeof v === 'boolean' && v ? [k] : tekstVelden(v, diepte + 1)
		);
	}
	return [];
}

/**
 * Probeert klasse en stilte per bak te lezen; geeft undefined als de data dat niet echt per bak bevat.
 * Staat iets bij élke bak van een treinstel (meerdere bakken), dan is het treinstel-informatie die
 * per bak herhaald wordt en niet te gebruiken voor de plek in de trein.
 */
export function bakIndeling(bakken: Ruw[]): BakInfo[] | undefined {
	if (!Array.isArray(bakken) || bakken.length === 0) return undefined;
	const indeling = bakken.map((b): BakInfo => {
		const velden = tekstVelden(b).map((s) => s.toUpperCase());
		const eersteKlas =
			b?.klasse === 1 ||
			b?.klasse === '1' ||
			velden.some((s) => /EERSTE[_ ]?KLAS|FIRST[_ ]?CLASS|^1E[_ ]?KLAS/.test(s));
		const stilte = velden.some((s) => /STILTE|SILENCE|QUIET/.test(s));
		return { eersteKlas, stilte, drukte: leesDrukte(b) };
	});
	const overal = (f: (b: BakInfo) => boolean) => indeling.length > 1 && indeling.every(f);
	const stilteBruikbaar = !overal((b) => b.stilte);
	const eersteBruikbaar = !overal((b) => b.eersteKlas);
	const schoon = indeling.map((b) => ({
		...b,
		stilte: stilteBruikbaar && b.stilte,
		eersteKlas: eersteBruikbaar && b.eersteKlas
	}));
	return schoon.some((b) => b.stilte || b.eersteKlas || b.drukte) ? schoon : undefined;
}

/** Drukte uit een bak of treinstel, onder welke naam NS die ook meegeeft */
function leesDrukte(x: Ruw): Drukte | undefined {
	for (const k of ['drukte', 'drukteVoorspelling', 'crowdForecast', 'bezetting', 'classification']) {
		const v = x?.[k];
		const d = nsDrukte(typeof v === 'object' ? (v?.niveau ?? v?.classification ?? v?.level) : v);
		if (d && d !== 'onbekend') return d;
	}
	return undefined;
}

function afbeeldingUrl(a: Ruw): string | undefined {
	const url = typeof a === 'string' ? a : (a?.url ?? a?.uri);
	return typeof url === 'string' && /^https:\/\//.test(url) ? url : undefined;
}

function bakAfbeeldingen(bakken: Ruw[]): string[] | undefined {
	if (!Array.isArray(bakken) || bakken.length === 0) return undefined;
	const urls = bakken.map((b) => afbeeldingUrl(b?.afbeelding ?? b?.image));
	return urls.every(Boolean) ? (urls as string[]) : undefined;
}

export async function nsSamenstelling(
	key: string | undefined,
	ritnummer: string,
	stationCode?: string,
	datumTijd?: string
): Promise<NsSamenstelling | null> {
	return gecached(`ns-vt:${ritnummer}:${stationCode ?? ''}`, 60, async () => {
		const pad = stationCode
			? `/virtual-train-api/api/v1/trein/${encodeURIComponent(ritnummer)}/${encodeURIComponent(stationCode)}`
			: `/virtual-train-api/api/v1/trein/${encodeURIComponent(ritnummer)}`;
		let r: Ruw;
		try {
			r = await ns(key, pad, { features: 'zitplaats,platformitems,cta,drukte', dateTime: datumTijd }, 7000);
		} catch (e) {
			if (e instanceof ApiFout && e.status === 404) return null;
			throw e;
		}
		const delenRuw: Ruw[] = Array.isArray(r?.materieeldelen) ? r.materieeldelen : [];
		const delen: TreinDeel[] = delenRuw.map((m) => ({
			nummer: m?.materieelnummer != null ? String(m.materieelnummer) : undefined,
			type: m?.type,
			faciliteiten: Array.isArray(m?.faciliteiten) ? m.faciliteiten.map((f: string) => String(f).toUpperCase()) : [],
			bakken: Array.isArray(m?.bakken) ? m.bakken.length : 0,
			afbeelding: afbeeldingUrl(m?.afbeelding),
			eindbestemming: m?.eindbestemming,
			indeling: bakIndeling(m?.bakken),
			bakAfbeeldingen: bakAfbeeldingen(m?.bakken),
			drukte: leesDrukte(m)
		}));
		const zitplaatsen = delenRuw.reduce((som, m) => {
			const z = m?.zitplaatsInfo ?? m?.zitplaatsen;
			if (!z || typeof z !== 'object') return som;
			return som + Object.entries(z).reduce((s, [k, v]) => (/zitplaats/i.test(k) && typeof v === 'number' ? s + v : s), 0);
		}, 0);
		const eersteKlasPerDeel = delenRuw.map((m) => {
			const z = m?.zitplaatsInfo ?? {};
			return Object.entries(z).some(([k, v]) => /eerste|first/i.test(k) && typeof v === 'number' && v > 0);
		});
		eersteKlasPerDeel.forEach((ja, i) => {
			if (ja) delen[i].eersteKlas = true;
		});
		const rijrichting = String(r?.rijrichting ?? '').toUpperCase();
		const bakkenTotaal = delen.reduce((s, d) => s + d.bakken, 0);
		return {
			ritnummer,
			station: r?.station,
			type: r?.type,
			vervoerder: r?.vervoerder,
			spoor: r?.spoor,
			delen,
			ingekort: !!r?.ingekort,
			lengteBakken: bakkenTotaal || (typeof r?.lengte === 'number' ? r.lengte : undefined),
			lengteMeter: typeof r?.lengteInMeters === 'number' ? r.lengteInMeters : undefined,
			rijrichting: rijrichting === 'LINKS' ? 'links' : rijrichting === 'RECHTS' ? 'rechts' : undefined,
			zitplaatsen: zitplaatsen || undefined,
			eersteKlasPerDeel,
			ruw: r
		};
	});
}

// ---------- Posities ----------

export async function nsTreinPositie(key: string | undefined, ritnummer: string): Promise<VoertuigPositie | null> {
	const r = await gecached('ns-voertuigen', 10, () => ns(key, '/virtual-train-api/api/vehicle', {}, 6000));
	const lijst: Ruw[] = r?.payload?.treinen ?? r?.treinen ?? [];
	const t = lijst.find((x) => String(x?.treinNummer ?? x?.ritId ?? '') === ritnummer);
	if (!t || typeof t.lat !== 'number' || typeof t.lng !== 'number') return null;
	return {
		lat: t.lat,
		lon: t.lng,
		snelheid: typeof t.snelheid === 'number' ? t.snelheid : undefined,
		richting: typeof t.richting === 'number' ? t.richting : undefined,
		tijd: new Date().toISOString(),
		soort: 'gps'
	};
}

// ---------- Spoorkaart (spoorgeometrie) ----------

/**
 * De NS SpoorKaart (GeoJSON met alle spoorlijnen) als ruwe tekst. Niet parsen op de server:
 * het bestand is groot en de app rekent zelf de route over het spoor uit. Eén dag gecachet.
 */
export async function nsSpoorkaart(key: string | undefined): Promise<string> {
	if (!key) throw new ApiFout('NS API-key is niet ingesteld', 0, 'ns');
	return gedeeldGecachedTekst('ns-spoorkaart-v1', 86400, async () => {
		let laatste: unknown;
		for (const pad of ['/Spoorkaart-API/api/v1/spoorkaart', '/Spoorkaart-API/api/v1/spoorkaart.json']) {
			try {
				return await haalTekst(`${NS_BASIS}${pad}`, { timeoutMs: 15000, headers: { 'Ocp-Apim-Subscription-Key': key }, bron: 'ns' });
			} catch (e) {
				laatste = e;
				if (!(e instanceof ApiFout && e.status === 404)) throw e;
			}
		}
		throw laatste;
	});
}

// ---------- Prijzen ----------

/** Prijs in centen voor een enkele reis 2e klas vol tarief tussen twee stations */
export async function nsPrijs(key: string | undefined, vanCode: string, naarCode: string): Promise<number | null> {
	if (!key || vanCode === naarCode) return null;
	return gedeeldGecached(`ns-prijs:${vanCode}:${naarCode}`, 86400, async () => {
		const r = await ns(key, '/reisinformatie-api/api/v3/trips', { fromStation: vanCode, toStation: naarCode, lang: 'nl' }, 7000);
		for (const t of r?.trips ?? []) {
			const p = t?.productFare?.priceInCents ?? t?.productFare?.buyableTicketPriceInCents;
			if (typeof p === 'number') return p;
			const fare = (t?.fares ?? []).find(
				(f: Ruw) => /SECOND/i.test(f?.travelClass ?? '') && /NO_DISCOUNT|NONE/i.test(f?.discountType ?? 'NO_DISCOUNT')
			);
			if (typeof fare?.priceInCents === 'number') return fare.priceInCents;
		}
		return null;
	});
}
