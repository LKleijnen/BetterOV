// Het gereedschap dat een AI-assistent via /api/mcp kan gebruiken: alles wat de app zelf ook
// kan — plannen, vertrektijden, treininfo, stations, voertuigen — plus je eigen gegevens en je
// actieve reis. Tijden zijn Nederlandse tijd. Deze module kent de omgeving niet zelf: de route
// geeft alles mee in McpContext, zodat dit bestand te testen is zonder SvelteKit.

import type { ActieveReisPointer, Advies, Favoriet, FavorietePlek, Plek, Profiel, Reis, VertrekAntwoord, WeekItem } from '../../types';
import type { Firestore, FsDocument } from '../firestore';
import type { Gereedschap, ServerGegevens, Uitkomst } from './protocol';
import { ApiFout } from '../http';
import { motisVertrektijden, motisZoek } from '../motis';
import { nsStations, nsVertrektijden, nsVoorzieningen, stationOpNaam, stationVoorPlek, type NsStation } from '../ns';
import { plan } from '../planner';
import { treinInfo } from '../trein';
import { verversAdvies } from '../reisstatus';
import { laatsteVerbinding } from '../laatste';
import { haalRit } from '../rit';
import { mockPlan, mockRit, mockStation, mockTrein, mockVertrektijden, mockZoek } from '../mock';
import { nieuwGeheim } from '../geheim';
import { vindProblemen } from '../../reis';
import { herinneringInstellingen } from '../../herinneringen';
import { optiesUitParams, pastBij, ALLE_VERVOER, type Reisopties, type Vervoer } from '../../reisopties';
import { laadVoertuigen, variantVoorNummer, zoekVoertuigen } from '../../voertuigen';
import { materieelSoort } from '../../materieel';
import { klok, nlDatum, nlDatumTijd, minutenTussen } from '../../tijd';
import type { Voorkeur } from '../../types';
import { adviesTekst, adviezenTekst, euro, plekTekst, reisTekst, stationTekst, tijdTekst, treinTekst, vertrekkenTekst } from './tekst';

type Opslag = Pick<Firestore, 'get' | 'zet' | 'lijst' | 'verwijder'>;

export interface McpDiensten {
	nsKey?: string;
	mock: boolean;
	/** Firestore, of null in demo-modus: persoonlijke gegevens staan dan alleen op het apparaat */
	fs: Opslag | null;
	gebruiker: { uid: string; email: string; naam?: string };
	/** Vaste 'nu' voor tests */
	nu?: number;
}

/** Alles wat een gereedschap nodig heeft; haalt je eigen gegevens één keer per aanroep op */
export class McpContext {
	constructor(public d: McpDiensten) {}

	get nu(): number {
		return this.d.nu ?? Date.now();
	}

	vereisOpslag(): Opslag {
		if (!this.d.fs) {
			throw new ApiFout('Je persoonlijke gegevens zijn hier niet beschikbaar: deze BetterOV draait in demo-modus (alles staat alleen in de browser).', 503);
		}
		return this.d.fs;
	}

	private cache = new Map<string, Promise<unknown>>();

	private eenmalig<T>(sleutel: string, haal: () => Promise<T>): Promise<T> {
		if (!this.cache.has(sleutel)) this.cache.set(sleutel, haal());
		return this.cache.get(sleutel) as Promise<T>;
	}

	profiel(): Promise<Profiel> {
		return this.eenmalig('profiel', async () => {
			const doc = await this.vereisOpslag().get<Profiel>(`users/${this.d.gebruiker.uid}`);
			return doc?.data ?? {};
		});
	}

	private lijst<T>(naam: string): Promise<T[]> {
		return this.eenmalig(naam, async () => {
			const docs = await this.vereisOpslag().lijst<T>(`users/${this.d.gebruiker.uid}/${naam}`, 100);
			return docs.map((d) => ({ ...d.data, id: d.id }) as T);
		});
	}

	plekken(): Promise<FavorietePlek[]> {
		return this.lijst<FavorietePlek>('plekken');
	}
	favorieten(): Promise<Favoriet[]> {
		return this.lijst<Favoriet>('favorieten');
	}
	weekplanning(): Promise<WeekItem[]> {
		return this.lijst<WeekItem>('weekplanning');
	}

	/** De kopie van de actieve reis die ook de cron-worker leest */
	actieveReis(): Promise<FsDocument<ActieveReisPointer> | null> {
		return this.eenmalig('actief', () => this.vereisOpslag().get<ActieveReisPointer>(`actieveReizen/${this.d.gebruiker.uid}`));
	}

	stations(): Promise<NsStation[]> {
		return this.eenmalig('stations', () => nsStations(this.d.nsKey).catch(() => [] as NsStation[]));
	}
}

// ---------- Argumenten uitlezen ----------

function tekst(a: Record<string, unknown>, naam: string, verplicht = false): string | undefined {
	const v = a[naam];
	if (v === undefined || v === null || v === '') {
		if (verplicht) throw new ApiFout(`"${naam}" is verplicht.`, 400);
		return undefined;
	}
	if (typeof v !== 'string' && typeof v !== 'number') throw new ApiFout(`"${naam}" moet tekst zijn.`, 400);
	return String(v).trim();
}

function getal(a: Record<string, unknown>, naam: string, standaard: number, min: number, max: number): number {
	const v = a[naam];
	if (v === undefined || v === null || v === '') return standaard;
	const n = Number(v);
	if (!Number.isFinite(n)) throw new ApiFout(`"${naam}" moet een getal zijn.`, 400);
	return Math.min(max, Math.max(min, Math.round(n)));
}

function waar(a: Record<string, unknown>, naam: string): boolean {
	return a[naam] === true || a[naam] === 'true' || a[naam] === 1 || a[naam] === '1';
}

/**
 * Tijdstip uit tekst. Begrijpt "nu", een volledige ISO-tijd, "2026-10-16 09:30" en "09:30"
 * (vandaag). Zonder tijdzone geldt Nederlandse tijd.
 */
export function naarTijdstip(invoer: string | undefined, nu = Date.now()): string | undefined {
	const t = invoer?.trim();
	if (!t || /^(nu|direct|meteen|zo snel mogelijk)$/i.test(t)) return undefined;
	if (/(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
		const d = Date.parse(t);
		if (Number.isNaN(d)) throw new ApiFout(`Onbegrijpelijke tijd: "${t}".`, 400);
		return new Date(d).toISOString();
	}
	const volledig = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/);
	if (volledig) return nlDatumTijd(volledig[1], volledig[2]).toISOString();
	const alleenDatum = t.match(/^(\d{4}-\d{2}-\d{2})$/);
	if (alleenDatum) return nlDatumTijd(alleenDatum[1], '08:00').toISOString();
	const alleenTijd = t.match(/^(\d{1,2}:\d{2})$/);
	if (alleenTijd) return nlDatumTijd(nlDatum(new Date(nu)), alleenTijd[1]).toISOString();
	throw new ApiFout(`Onbegrijpelijke tijd: "${t}". Gebruik bijvoorbeeld "2026-10-16 09:30", "09:30" of "nu".`, 400);
}

const THUIS = /^(thuis|huis|naar huis|mijn huis|home)$/i;

function coordinaat(t: string): Plek | null {
	const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/);
	if (!m) return null;
	const lat = Number(m[1].replace(',', '.'));
	const lon = Number(m[2].replace(',', '.'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	return { naam: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon, type: 'gps' };
}

function besteTreffer(treffers: Plek[], zoek: string): Plek {
	const z = zoek.toLowerCase();
	return (
		treffers.find((p) => p.naam.toLowerCase() === z) ??
		treffers.find((p) => p.type === 'station' && p.naam.toLowerCase().includes(z)) ??
		treffers[0]
	);
}

/**
 * Zet een omschrijving ("Utrecht Centraal", "thuis", "52.09,5.11", een eigen favoriete plek)
 * om in een plek met coördinaten.
 */
export async function naarPlek(invoer: unknown, ctx: McpContext, veld = 'plek'): Promise<Plek> {
	const t = String(invoer ?? '').trim();
	if (!t) throw new ApiFout(`"${veld}" is verplicht.`, 400);
	if (THUIS.test(t)) {
		const thuis = ctx.d.fs ? (await ctx.profiel()).thuislocatie : undefined;
		if (!thuis) throw new ApiFout('Er staat nog geen thuislocatie in BetterOV (Meer → Instellingen). Geef het adres of station zelf op.', 400);
		return thuis;
	}
	const coord = coordinaat(t);
	if (coord) return coord;
	if (ctx.d.fs) {
		const eigen = await ctx.plekken().catch(() => [] as FavorietePlek[]);
		const gevonden =
			eigen.find((p) => p.naam.toLowerCase() === t.toLowerCase()) ?? eigen.find((p) => p.naam.toLowerCase().includes(t.toLowerCase()));
		if (gevonden) return gevonden.plek;
	}
	const treffers = ctx.d.mock ? mockZoek(t) : await motisZoek(t).catch(() => [] as Plek[]);
	if (treffers.length) return besteTreffer(treffers, t);
	const station = stationOpNaam(await ctx.stations(), t);
	if (station) return { naam: station.naam, lat: station.lat, lon: station.lon, type: 'station' };
	throw new ApiFout(`Geen plek gevonden voor "${t}". Zoek eerst met zoek_plek.`, 404);
}

async function naarStation(invoer: string | undefined, ctx: McpContext): Promise<NsStation | undefined> {
	if (!invoer) return undefined;
	const stations = await ctx.stations();
	if (/^[A-Z]{2,5}$/i.test(invoer)) {
		const opCode = stations.find((s) => s.code === invoer.toUpperCase());
		if (opCode) return opCode;
	}
	return stationOpNaam(stations, invoer) ?? stationVoorPlek(stations, await naarPlek(invoer, ctx).catch(() => undefined), 2000);
}

function reisoptiesUit(a: Record<string, unknown>): Reisopties {
	const p = new URLSearchParams();
	const extra = getal(a, 'extra_overstaptijd', 0, 0, 60);
	if (extra > 0) p.set('extraOverstap', String(extra));
	const vervoer = Array.isArray(a.vervoer) ? (a.vervoer as unknown[]).map(String) : undefined;
	if (vervoer?.length) p.set('vervoer', vervoer.filter((v): v is Vervoer => (ALLE_VERVOER as string[]).includes(v)).join(','));
	if (waar(a, 'zonder_reservering')) p.set('zonderReservering', '1');
	if (waar(a, 'toegankelijk')) p.set('toegankelijk', '1');
	return optiesUitParams(p);
}

const VOORKEUREN: Voorkeur[] = ['snelst', 'overstappen', 'goedkoopst', 'drukte'];

/** Compacte versie van een advies voor de JSON naast de tekst */
function kortAdvies(a: Advies) {
	return {
		id: a.id,
		vertrek: a.vertrek.verwacht,
		aankomst: a.aankomst.verwacht,
		duurMinuten: Math.round(a.duur / 60),
		overstappen: a.overstappen,
		prijsCenten: a.prijs?.bedrag,
		drukte: a.drukte,
		legs: a.legs.map((l) => ({
			modus: l.modus,
			lijn: l.lijn ?? l.productNaam,
			richting: l.richting,
			van: l.van.naam,
			naar: l.naar.naam,
			vertrek: l.vertrek.verwacht,
			aankomst: l.aankomst.verwacht,
			spoor: l.van.spoor,
			ritnummer: l.ritnummer,
			tripId: l.tripId,
			uitgevallen: l.uitgevallen || undefined
		}))
	};
}

async function planAdviezen(a: Record<string, unknown>, ctx: McpContext): Promise<{ van: Plek; naar: Plek; antwoord: Awaited<ReturnType<typeof plan>> }> {
	const van = await naarPlek(tekst(a, 'van', true), ctx, 'van');
	const naar = await naarPlek(tekst(a, 'naar', true), ctx, 'naar');
	const via = a.via ? await naarPlek(tekst(a, 'via'), ctx, 'via') : undefined;
	const tijd = naarTijdstip(tekst(a, 'tijd'), ctx.nu);
	const aankomst = waar(a, 'aankomst');
	const voorkeurIn = tekst(a, 'voorkeur');
	const voorkeur = (VOORKEUREN as string[]).includes(voorkeurIn ?? '') ? (voorkeurIn as Voorkeur) : 'snelst';
	const opties = reisoptiesUit(a);
	if (ctx.d.mock) {
		const r = mockPlan({ van, naar, tijd, voorkeur });
		return { van, naar, antwoord: { ...r, adviezen: r.adviezen.filter((x) => pastBij(x, opties)) } };
	}
	const antwoord = await plan({ van, naar, via, tijd, aankomst, voorkeur, opties }, { nsKey: ctx.d.nsKey });
	return { van, naar, antwoord };
}

// ---------- Gereedschap ----------

const zoekPlek: Gereedschap<McpContext> = {
	naam: 'zoek_plek',
	titel: 'Zoek een halte, station of adres',
	omschrijving:
		'Zoekt stations, haltes, adressen en plaatsen in Nederland (bron: Transitous/MOTIS). Gebruik dit als je twijfelt welke halte iemand bedoelt, of om een stopId te vinden voor vertrektijden.',
	schema: {
		type: 'object',
		properties: {
			zoekterm: { type: 'string', description: 'Naam van een station, halte, straat of plaats, bijvoorbeeld "Utrecht Centraal" of "Oudegracht 100 Utrecht".' },
			bij: { type: 'string', description: 'Optioneel "lat,lon" om resultaten in de buurt voorrang te geven.' }
		},
		required: ['zoekterm']
	},
	async uitvoer(a, ctx) {
		const q = tekst(a, 'zoekterm', true)!;
		const bij = coordinaat(tekst(a, 'bij') ?? '');
		const treffers = ctx.d.mock ? mockZoek(q) : await motisZoek(q, bij ? { lat: bij.lat, lon: bij.lon } : undefined);
		if (!treffers.length) return { tekst: `Niets gevonden voor "${q}".` };
		return {
			tekst: [`Gevonden voor "${q}":`, ...treffers.map((p) => `- ${plekTekst(p)} — ${p.lat.toFixed(5)},${p.lon.toFixed(5)}${p.stopId ? ` · stopId ${p.stopId}` : ''}`)].join('\n'),
			data: treffers
		};
	}
};

const planReis: Gereedschap<McpContext> = {
	naam: 'plan_reis',
	titel: 'Plan een reis',
	omschrijving:
		'Plant een reis met het openbaar vervoer in Nederland, met realtime vertragingen, sporen, drukte (NS) en prijs. Plaatsen mogen gewoon in woorden ("Utrecht Centraal", "Damrak 1 Amsterdam", "thuis" voor de ingestelde thuislocatie).',
	schema: {
		type: 'object',
		properties: {
			van: { type: 'string', description: 'Vertrekpunt: station, halte, adres, "thuis" of "lat,lon".' },
			naar: { type: 'string', description: 'Bestemming, zelfde vorm als van.' },
			via: { type: 'string', description: 'Optioneel tussenpunt.' },
			tijd: { type: 'string', description: 'Wanneer: "nu" (standaard), "09:30" (vandaag), "2026-10-16 09:30" of een volledige ISO-tijd. Zonder tijdzone geldt Nederlandse tijd.' },
			aankomst: { type: 'boolean', description: 'true als "tijd" de gewenste aankomsttijd is in plaats van de vertrektijd.' },
			voorkeur: { type: 'string', enum: VOORKEUREN, description: 'Waar de reis op gesorteerd/gekozen wordt (standaard snelst).' },
			extra_overstaptijd: { type: 'number', description: 'Minuten extra overstaptijd (0-60).' },
			vervoer: { type: 'array', items: { type: 'string', enum: ALLE_VERVOER }, description: 'Alleen deze vervoermiddelen gebruiken.' },
			zonder_reservering: { type: 'boolean', description: 'Treinen met verplichte reservering (Eurostar, nachttrein) overslaan.' },
			toegankelijk: { type: 'boolean', description: 'Route zonder trappen (rolstoel, kinderwagen).' },
			aantal: { type: 'number', description: 'Hoeveel adviezen teruggeven (1-10, standaard 5).' }
		},
		required: ['van', 'naar']
	},
	async uitvoer(a, ctx) {
		const { van, naar, antwoord } = await planAdviezen(a, ctx);
		const aantal = getal(a, 'aantal', 5, 1, 10);
		const adviezen = antwoord.adviezen.slice(0, aantal);
		return {
			tekst: adviezenTekst({ ...antwoord, adviezen }, van, naar),
			data: { van, naar, bron: antwoord.bron, adviezen: adviezen.map(kortAdvies) }
		};
	}
};

const vertrektijden: Gereedschap<McpContext> = {
	naam: 'vertrektijden',
	titel: 'Vertrektijden van een halte',
	omschrijving: 'Het vertrekbord van een station of halte: wat er nu vertrekt, van welk spoor, met vertraging en meldingen.',
	schema: {
		type: 'object',
		properties: {
			halte: { type: 'string', description: 'Station, halte, "thuis" of "lat,lon".' },
			tijd: { type: 'string', description: 'Vanaf welk moment (standaard nu).' },
			aantal: { type: 'number', description: 'Hoeveel vertrekken (1-30, standaard 10).' }
		},
		required: ['halte']
	},
	async uitvoer(a, ctx) {
		const plek = await naarPlek(tekst(a, 'halte', true), ctx, 'halte');
		const tijd = naarTijdstip(tekst(a, 'tijd'), ctx.nu);
		const aantal = getal(a, 'aantal', 10, 1, 30);
		let antwoord: VertrekAntwoord;
		if (ctx.d.mock) {
			antwoord = mockVertrektijden(plek.naam);
		} else {
			try {
				const r = await motisVertrektijden(
					{ stopId: plek.stopId, lat: plek.lat, lon: plek.lon, straal: plek.stopId ? undefined : 500, tijd },
					6000
				);
				antwoord = {
					halte: { ...r.halte, naam: plek.stopId ? plek.naam : r.halte.naam },
					vertrekken: r.vertrekken,
					bron: 'transitous',
					opgehaaldOp: new Date(ctx.nu).toISOString()
				};
			} catch (e) {
				// Terugval op het NS-vertrekbord als dit een treinstation is
				const station = stationVoorPlek(await ctx.stations(), plek, 500);
				if (!station) throw e;
				antwoord = {
					halte: { naam: station.naam, lat: station.lat, lon: station.lon },
					vertrekken: await nsVertrektijden(ctx.d.nsKey, station.code),
					bron: 'ns',
					melding: 'Transitous reageerde niet; alleen treinen van het NS-vertrekbord.',
					opgehaaldOp: new Date(ctx.nu).toISOString()
				};
			}
		}
		const vertrekken = antwoord.vertrekken.slice(0, aantal);
		return { tekst: vertrekkenTekst({ ...antwoord, vertrekken }), data: { ...antwoord, vertrekken } };
	}
};

const ritHaltes: Gereedschap<McpContext> = {
	naam: 'rit_haltes',
	titel: 'Alle haltes van een rit',
	omschrijving: 'De hele route van één trein, bus, tram of metro: alle haltes met aankomst- en vertrektijden en sporen. Gebruik het ritnummer (trein) of tripId uit plan_reis.',
	schema: {
		type: 'object',
		properties: {
			ritnummer: { type: 'string', description: 'NS-ritnummer (treinnummer), bijvoorbeeld "3052".' },
			trip_id: { type: 'string', description: 'tripId van Transitous, uit plan_reis of vertrektijden.' },
			datum: { type: 'string', description: 'Dag van de rit (ISO), als het niet vandaag is.' }
		}
	},
	async uitvoer(a, ctx) {
		const ritnummer = tekst(a, 'ritnummer');
		const tripId = tekst(a, 'trip_id');
		if (!ritnummer && !tripId) throw new ApiFout('Geef een ritnummer of trip_id.', 400);
		const nu = new Date(ctx.nu).toISOString();
		const r = ctx.d.mock
			? {
					leg: mockRit({
						ritnummer,
						tripId,
						van: { naam: 'Utrecht Centraal', lat: 52.0894, lon: 5.1101, tijd: nu },
						naar: { naam: 'Amsterdam Centraal', lat: 52.3789, lon: 4.9003, tijd: new Date(ctx.nu + 1800_000).toISOString() }
					}),
					bron: 'transitous' as const,
					opgehaaldOp: nu
				}
			: await haalRit({ ritnummer, tripId, datum: tekst(a, 'datum') }, { nsKey: ctx.d.nsKey });
		const leg = r.leg;
		const haltes = [leg.van, ...leg.tussenstops, leg.naar];
		const regels = haltes.map((h) => {
			const tijden = [h.aankomst ? `aan ${tijdTekst(h.aankomst)}` : '', h.vertrek ? `vert ${tijdTekst(h.vertrek)}` : ''].filter(Boolean).join(', ');
			const spoor = h.spoor ?? h.geplandSpoor;
			return `- ${h.naam}${tijden ? ` — ${tijden}` : ''}${spoor ? ` · spoor ${spoor}` : ''}${h.uitgevallen ? ' · STOPT HIER NIET' : ''}`;
		});
		const kop = `${leg.lijn ?? leg.productNaam ?? 'Rit'}${leg.ritnummer ? ` ${leg.ritnummer}` : ''} ${leg.van.naam} → ${leg.naar.naam} (${haltes.length} haltes, bron ${r.bron === 'ns' ? 'NS' : 'Transitous'}):`;
		return { tekst: [kop, ...regels].join('\n'), data: { bron: r.bron, lijn: leg.lijn, ritnummer: leg.ritnummer, haltes } };
	}
};

const treinGereedschap: Gereedschap<McpContext> = {
	naam: 'trein_info',
	titel: 'Welke trein is dit (samenstelling, drukte, splitsen)',
	omschrijving:
		'Alles over één NS-trein: materieeltype en versie, aantal bakken, of de trein korter is dan normaal, drukte, voorzieningen, waar je het beste instapt (1e klas, stilte) en of de trein onderweg splitst. Alleen NS-treinen; voor bus, tram en metro bestaat deze informatie niet in de open data.',
	schema: {
		type: 'object',
		properties: {
			ritnummer: { type: 'string', description: 'NS-ritnummer (treinnummer) uit plan_reis of vertrektijden.' },
			station: { type: 'string', description: 'Station waar je instapt (naam of code); bepaalt welke samenstelling en welk spoor.' },
			naar: { type: 'string', description: 'Station waar je uitstapt; nodig om te weten in welk deel je moet zitten als de trein splitst.' },
			datum: { type: 'string', description: 'Dag en tijd van de rit (ISO), als het niet nu is.' }
		},
		required: ['ritnummer']
	},
	async uitvoer(a, ctx) {
		const ritnummer = tekst(a, 'ritnummer', true)!;
		if (!/^\d{1,6}$/.test(ritnummer)) throw new ApiFout('Een ritnummer bestaat uit cijfers, bijvoorbeeld "3052".', 400);
		if (ctx.d.mock) {
			const info = mockTrein(ritnummer);
			return { tekst: treinTekst(info), data: info };
		}
		if (!ctx.d.nsKey) throw new ApiFout('Treininformatie komt van de NS API, en die is in deze BetterOV niet ingesteld.', 503);
		const station = await naarStation(tekst(a, 'station'), ctx);
		const info = await treinInfo(ctx.d.nsKey, ritnummer, {
			stationCode: station?.code,
			stationNaam: station?.naam ?? tekst(a, 'station'),
			lat: station?.lat,
			lon: station?.lon,
			naar: tekst(a, 'naar'),
			datumTijd: naarTijdstip(tekst(a, 'datum'), ctx.nu)
		});
		return { tekst: treinTekst(info), data: info };
	}
};

const stationGereedschap: Gereedschap<McpContext> = {
	naam: 'station_info',
	titel: 'Informatie over een station',
	omschrijving: 'Sporen, soort station, reisassistentie en voorzieningen op en bij een NS-station (winkels, toiletten, OV-fiets, kluizen), met openingstijden als NS die geeft.',
	schema: {
		type: 'object',
		properties: { station: { type: 'string', description: 'Naam of code van het station, bijvoorbeeld "Amersfoort Centraal" of "AMF".' } },
		required: ['station']
	},
	async uitvoer(a, ctx) {
		const naam = tekst(a, 'station', true)!;
		if (ctx.d.mock) {
			const info = mockStation(naam);
			return { tekst: stationTekst(info), data: info };
		}
		if (!ctx.d.nsKey) throw new ApiFout('Stationsinformatie komt van de NS API, en die is in deze BetterOV niet ingesteld.', 503);
		const station = await naarStation(naam, ctx);
		if (!station) throw new ApiFout(`"${naam}" is geen NS-station.`, 404);
		const voorzieningen = await nsVoorzieningen(ctx.d.nsKey, station).catch(() => []);
		const info = {
			code: station.code,
			naam: station.naam,
			lat: station.lat,
			lon: station.lon,
			land: station.land,
			type: station.type,
			sporen: station.sporen ?? [],
			reisassistentie: station.reisassistentie,
			voorzieningen,
			bron: ['NS Reisinformatie API', ...(voorzieningen.length ? ['NS Places API'] : [])],
			opgehaaldOp: new Date(ctx.nu).toISOString()
		};
		return { tekst: stationTekst(info), data: info };
	}
};

const voertuigGereedschap: Gereedschap<McpContext> = {
	naam: 'voertuig_info',
	titel: 'Over een trein-, tram- of metrotype',
	omschrijving:
		'De voertuigengids van BetterOV: vaste, openbaar bekende gegevens per type (VIRM, ICNG, SNG, Flirt, …). Zoek op typenaam, bijnaam of treinstelnummer ("8651") om te weten in welk voertuig en welke versie je zit.',
	schema: {
		type: 'object',
		properties: {
			zoekterm: { type: 'string', description: 'Typenaam, bijnaam of treinstelnummer, bijvoorbeeld "VIRM", "dubbeldekker" of "8651".' }
		},
		required: ['zoekterm']
	},
	async uitvoer(a) {
		const q = tekst(a, 'zoekterm', true)!;
		const treffers = zoekVoertuigen(await laadVoertuigen(), q).slice(0, 2);
		if (!treffers.length) return { tekst: `Geen voertuig gevonden voor "${q}".` };
		const blokken = treffers.map(({ voertuig: v, variant }) => {
			const index = variant ?? variantVoorNummer(v, q);
			const soort = materieelSoort(v.code);
			const regels = [
				`${v.naam} (${v.code}${v.vervoerders ? `, ${v.vervoerders}` : ''}) — ${v.soort}`,
				v.kort,
				soort?.snelheid ? `Snelheid in de dienstregeling: ${soort.snelheid} km/u${soort.snelheidNoot ? ` (${soort.snelheidNoot})` : ''}.` : '',
				...v.techniek.map((t) => `- ${t.label}: ${t.waarde}`)
			];
			if (index >= 0 && v.varianten[index]) {
				const va = v.varianten[index];
				regels.push(`Dit nummer hoort bij versie ${va.naam}: ${va.omschrijving}${va.herkenning ? ` Herkenning: ${va.herkenning}` : ''}`);
			} else if (v.varianten.length) {
				regels.push(`Versies: ${v.varianten.map((va) => va.naam).join(', ')}.`);
			}
			if (v.feiten.length) regels.push(`Wist je dat: ${v.feiten.slice(0, 3).join(' ')}`);
			if (v.bronnen.length) regels.push(`Bronnen: ${v.bronnen.map((b) => b.url).join(', ')}`);
			return regels.filter(Boolean).join('\n');
		});
		return { tekst: blokken.join('\n\n'), data: treffers.map((t) => ({ id: t.voertuig.id, naam: t.voertuig.naam, variant: t.variant })) };
	}
};

const laatsteTrein: Gereedschap<McpContext> = {
	naam: 'laatste_trein_naar_huis',
	titel: 'Laatste reis naar huis',
	omschrijving: 'Zoekt de laatste reis van vanavond/vannacht naar een bestemming (standaard de ingestelde thuislocatie) en hoeveel tijd je nog hebt.',
	schema: {
		type: 'object',
		properties: {
			van: { type: 'string', description: 'Waar je nu bent: station, halte, adres of "lat,lon".' },
			naar: { type: 'string', description: 'Bestemming; standaard je thuislocatie uit BetterOV.' }
		},
		required: ['van']
	},
	async uitvoer(a, ctx) {
		const van = await naarPlek(tekst(a, 'van', true), ctx, 'van');
		const naar = await naarPlek(tekst(a, 'naar') ?? 'thuis', ctx, 'naar');
		if (ctx.d.mock) {
			const r = mockPlan({ van, naar, voorkeur: 'snelst', tijd: new Date(ctx.nu + 3 * 3600_000).toISOString() });
			const advies = [...r.adviezen].sort((x, y) => Date.parse(y.vertrek.verwacht) - Date.parse(x.vertrek.verwacht))[0];
			return { tekst: `Laatste reis ${plekTekst(van)} → ${plekTekst(naar)}:\n${adviesTekst(advies)}`, data: kortAdvies(advies) };
		}
		const r = await laatsteVerbinding(van, naar, ctx.d.nsKey);
		if (!r.advies) return { tekst: `Geen laatste reis gevonden van ${plekTekst(van)} naar ${plekTekst(naar)}.${r.melding ? ` ${r.melding}` : ''}` };
		const speling = r.spelingMin ?? minutenTussen(new Date(ctx.nu).toISOString(), r.advies.vertrek.verwacht);
		return {
			tekst: [
				`Laatste reis ${plekTekst(van)} → ${plekTekst(naar)} (je hebt nog ${speling} min):`,
				adviesTekst(r.advies),
				r.melding ?? ''
			]
				.filter(Boolean)
				.join('\n'),
			data: { spelingMin: speling, advies: kortAdvies(r.advies) }
		};
	}
};

const mijnReis: Gereedschap<McpContext> = {
	naam: 'mijn_reis',
	titel: 'Mijn lopende reis',
	omschrijving:
		'De reis die BetterOV nu voor je bewaakt: waar je in zit, wat de volgende stap is, vertragingen, spoorwijzigingen en of overstappen nog haalbaar zijn. Ververst de reis met realtime gegevens.',
	schema: { type: 'object', properties: {} },
	async uitvoer(_a, ctx) {
		const doc = await ctx.actieveReis();
		const p = doc?.data;
		if (!p?.advies?.legs?.length) {
			return { tekst: 'Er loopt nu geen reis in BetterOV. Plan er een met plan_reis, of start de bewaking met start_reis.' };
		}
		const { advies } = ctx.d.mock ? { advies: p.advies } : await verversAdvies(p.advies, { nsKey: ctx.d.nsKey });
		// De kopie voor de cron-worker weet niet wanneer de reis begon; dat staat bij de reis zelf
		const bewaard = await ctx
			.vereisOpslag()
			.get<Omit<Reis, 'id'>>(`users/${p.uid}/reizen/${p.reisId}`)
			.catch(() => null);
		const reis: Reis = {
			id: p.reisId,
			status: bewaard?.data.status ?? 'actief',
			van: p.van,
			naar: p.naar,
			advies,
			aangemaaktOp: bewaard?.data.aangemaaktOp ?? p.advies.vertrek.gepland,
			gestartOp: bewaard?.data.gestartOp
		};
		return {
			tekst: reisTekst(reis, vindProblemen(advies, ctx.nu), ctx.nu),
			data: { reisId: p.reisId, van: p.van, naar: p.naar, advies: kortAdvies(advies), problemen: vindProblemen(advies, ctx.nu) }
		};
	}
};

const mijnGegevens: Gereedschap<McpContext> = {
	naam: 'mijn_gegevens',
	titel: 'Mijn instellingen, favorieten en weekplanning',
	omschrijving: 'Je eigen gegevens in BetterOV: thuislocatie, favoriete reizen en plekken, vaste reizen per week en de meldingsinstellingen. Handig om te weten wat "thuis" of "naar werk" betekent.',
	schema: { type: 'object', properties: {} },
	async uitvoer(_a, ctx) {
		const [profiel, favorieten, plekken, week] = await Promise.all([ctx.profiel(), ctx.favorieten(), ctx.plekken(), ctx.weekplanning()]);
		const h = herinneringInstellingen(profiel.herinneringen);
		const dagNamen = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
		const regels = [
			`BetterOV-gegevens van ${profiel.naam ?? ctx.d.gebruiker.email}:`,
			`Thuislocatie: ${profiel.thuislocatie ? plekTekst(profiel.thuislocatie) : 'niet ingesteld'}.`,
			`Laatste trein naar huis: ${profiel.laatsteTrein === 'uit' ? 'uit' : 'automatisch'}.`,
			`Herinneringen: instappen ${h.instappen.join(', ') || 'uit'} s vooraf, uitstappen ${h.uitstappen.join(', ') || 'uit'} s vooraf.`
		];
		if (favorieten.length) {
			regels.push('Favoriete reizen:');
			regels.push(...favorieten.map((f) => `- ${f.naam ?? `${f.van.naam} → ${f.naar.naam}`}: ${plekTekst(f.van)} → ${plekTekst(f.naar)}${f.via ? ` via ${f.via.naam}` : ''}`));
		}
		if (plekken.length) {
			regels.push('Favoriete plekken:');
			regels.push(...plekken.map((p) => `- ${p.naam}: ${plekTekst(p.plek)}`));
		}
		if (week.length) {
			regels.push('Vaste reizen per week:');
			regels.push(
				...week.map(
					(w) =>
						`- ${w.naam ?? `${w.van.naam} → ${w.naar.naam}`}: ${w.dagen.map((d) => dagNamen[d - 1] ?? d).join('/')} ${w.tijd} ${w.soort === 'aankomst' ? 'aankomen' : 'vertrekken'}, ${plekTekst(w.van)} → ${plekTekst(w.naar)}`
				)
			);
		}
		return { tekst: regels.join('\n'), data: { profiel, favorieten, plekken, weekplanning: week } };
	}
};

/** Verwijdert undefined-waarden, zoals de app ook doet voor Firestore */
function schoon<T>(x: T): T {
	return JSON.parse(JSON.stringify(x)) as T;
}

async function rondAf(fs: Opslag, p: ActieveReisPointer, nu: number): Promise<void> {
	const tijd = new Date(nu).toISOString();
	await fs.zet(`users/${p.uid}/reizen/${p.reisId}`, { status: 'afgerond', afgerondOp: tijd }, ['status', 'afgerondOp']).catch(() => {});
	await fs.verwijder(`actieveReizen/${p.uid}`);
	if (p.gedeeldId) {
		await fs
			.zet(`gedeeldeReizen/${p.gedeeldId}`, { reis: { status: 'afgerond', bijgewerktOp: tijd } }, ['reis.status', 'reis.bijgewerktOp'])
			.catch(() => {});
	}
}

const startReis: Gereedschap<McpContext> = {
	naam: 'start_reis',
	titel: 'Reis starten en laten bewaken',
	omschrijving:
		'Plant de reis en zet hem als actieve reis in BetterOV. Vanaf dan bewaakt de app de reis en krijgt de gebruiker pushmeldingen bij uitval, vertraging, spoorwijzigingen en krappe overstappen, plus herinneringen om in en uit te stappen. Een eventuele lopende reis wordt afgerond. Vraag eerst of de gebruiker dit wil.',
	alleenLezen: false,
	schema: {
		type: 'object',
		properties: {
			van: { type: 'string', description: 'Vertrekpunt, zoals bij plan_reis.' },
			naar: { type: 'string', description: 'Bestemming, zoals bij plan_reis.' },
			via: { type: 'string', description: 'Optioneel tussenpunt.' },
			tijd: { type: 'string', description: 'Wanneer (standaard nu).' },
			aankomst: { type: 'boolean', description: 'true als "tijd" de aankomsttijd is.' },
			keuze: { type: 'string', description: 'Welk advies: het nummer uit plan_reis ("1", "2") of het id van een advies. Standaard het eerste.' }
		},
		required: ['van', 'naar']
	},
	async uitvoer(a, ctx) {
		const fs = ctx.vereisOpslag();
		const { van, naar, antwoord } = await planAdviezen(a, ctx);
		if (!antwoord.adviezen.length) return { tekst: `Geen reis gevonden van ${plekTekst(van)} naar ${plekTekst(naar)}; niets gestart.`, fout: true };
		const keuze = tekst(a, 'keuze');
		// Nooit stilletjes een andere reis starten dan gevraagd: liever vragen om opnieuw te plannen
		const gekozen = keuze
			? (antwoord.adviezen.find((x) => x.id === keuze) ?? (/^\d+$/.test(keuze) ? antwoord.adviezen[Number(keuze) - 1] : undefined))
			: antwoord.adviezen[0];
		if (!gekozen) {
			throw new ApiFout(
				`Advies "${keuze}" zit niet in deze zoekopdracht (de tijden zijn net opnieuw opgehaald). Plan nog een keer met plan_reis en kies een nummer uit die lijst.`,
				400
			);
		}
		const advies = gekozen;
		const oud = await ctx.actieveReis();
		if (oud?.data?.uid) await rondAf(fs, oud.data, ctx.nu);
		const tijdNu = new Date(ctx.nu).toISOString();
		const uid = ctx.d.gebruiker.uid;
		const reisId = nieuwGeheim(12);
		await fs.zet(
			`users/${uid}/reizen/${reisId}`,
			schoon({ status: 'actief', van, naar, advies, aangemaaktOp: tijdNu, gestartOp: tijdNu, laatstBijgewerkt: tijdNu })
		);
		const pointer: ActieveReisPointer = {
			uid,
			reisId,
			van,
			naar,
			advies,
			gemeld: [],
			eindeOp: advies.aankomst.verwacht,
			herinneringen: herinneringInstellingen((await ctx.profiel()).herinneringen)
		};
		await fs.zet(`actieveReizen/${uid}`, schoon(pointer) as unknown as Record<string, unknown>);
		return {
			tekst: [
				`Reis gestart en wordt nu bewaakt${oud?.data?.reisId ? ' (de vorige actieve reis is afgerond)' : ''}:`,
				adviesTekst(advies),
				'BetterOV stuurt een pushmelding als er iets verandert.'
			].join('\n'),
			data: { reisId, advies: kortAdvies(advies) }
		};
	}
};

const stopReis: Gereedschap<McpContext> = {
	naam: 'stop_reis',
	titel: 'Lopende reis afronden',
	omschrijving: 'Zet de lopende reis op afgerond, zodat BetterOV er geen meldingen meer over stuurt.',
	alleenLezen: false,
	schema: { type: 'object', properties: {} },
	async uitvoer(_a, ctx) {
		const fs = ctx.vereisOpslag();
		const doc = await ctx.actieveReis();
		if (!doc?.data?.uid) return { tekst: 'Er loopt geen reis; er is niets afgerond.' };
		await rondAf(fs, doc.data, ctx.nu);
		return { tekst: `Reis ${plekTekst(doc.data.van)} → ${plekTekst(doc.data.naar)} is afgerond. Je krijgt er geen meldingen meer over.` };
	}
};

export const GEREEDSCHAPPEN: Gereedschap<McpContext>[] = [
	planReis,
	vertrektijden,
	mijnReis,
	treinGereedschap,
	ritHaltes,
	stationGereedschap,
	voertuigGereedschap,
	zoekPlek,
	laatsteTrein,
	mijnGegevens,
	startReis,
	stopReis
];

export const SERVER: ServerGegevens = {
	naam: 'betterov',
	titel: 'BetterOV',
	versie: '1.0.0',
	instructies: [
		'BetterOV is een Nederlandse OV-app die een reis ook bewaakt. Via dit gereedschap kun je reizen plannen, vertrektijden en treininformatie opvragen en de lopende reis van de gebruiker bekijken.',
		'Tijden zijn altijd Nederlandse tijd (Europe/Amsterdam) en worden als "14:05 (+3)" geschreven: verwachte tijd met de vertraging in minuten.',
		'Plaatsen mogen in gewone woorden ("Utrecht Centraal", "Damrak 1 Amsterdam"); "thuis" is de thuislocatie van de gebruiker. Twijfel je over een halte, gebruik dan zoek_plek.',
		'Gebruik mijn_reis voor vragen als "haal ik mijn overstap?" of "in welke trein zit ik?", en trein_info (met ritnummer, instap- en uitstapstation) voor de samenstelling, drukte, instapplek en of de trein splitst.',
		'start_reis en stop_reis veranderen iets in de app en sturen meldingen naar de telefoon van de gebruiker: vraag altijd eerst om bevestiging.',
		'Bronnen noemen als je gegevens doorgeeft: reisadviezen en haltes komen van Transitous (OpenStreetMap/GTFS), realtime treinen, drukte en samenstelling van de NS Reisinformatie API.'
	].join('\n')
};
