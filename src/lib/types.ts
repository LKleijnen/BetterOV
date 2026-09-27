// Gedeelde types voor app, server-routes en cron-worker.
// Alleen relatieve imports in gedeelde modules, zodat de cron-worker ze kan bundelen.

export type Modus = 'trein' | 'bus' | 'tram' | 'metro' | 'veer' | 'lopen' | 'fiets' | 'auto' | 'overig';

export type Voorkeur = 'snelst' | 'overstappen' | 'goedkoopst' | 'drukte';

export type Drukte = 'laag' | 'gemiddeld' | 'hoog' | 'onbekend';

export type PlekType = 'adres' | 'halte' | 'station' | 'plek' | 'gps';

export interface Plek {
	naam: string;
	lat: number;
	lon: number;
	/** Transitous stop-ID, alleen voor haltes en stations */
	stopId?: string;
	type?: PlekType;
	/** Extra regel onder de naam, bijvoorbeeld de plaatsnaam */
	omschrijving?: string;
}

export interface Tijd {
	/** ISO-tijdstip volgens dienstregeling */
	gepland: string;
	/** ISO-tijdstip volgens realtime-informatie (gelijk aan gepland als er geen realtime is) */
	verwacht: string;
}

export interface Halte {
	naam: string;
	lat: number;
	lon: number;
	stopId?: string;
	aankomst?: Tijd;
	vertrek?: Tijd;
	geplandSpoor?: string;
	spoor?: string;
	uitgevallen?: boolean;
}

export interface Melding {
	kop: string;
	tekst?: string;
	ernst?: 'info' | 'waarschuwing' | 'ernstig';
	url?: string;
}

export interface Leg {
	modus: Modus;
	van: Halte;
	naar: Halte;
	vertrek: Tijd;
	aankomst: Tijd;
	/** Duur in seconden */
	duur: number;
	tussenstops: Halte[];
	/** Korte lijnaanduiding, bijvoorbeeld "IC", "Bus 12" of "Tram 4" */
	lijn?: string;
	/** Productnaam, bijvoorbeeld "Intercity" of "Sprinter" */
	productNaam?: string;
	richting?: string;
	vervoerder?: string;
	/** NS-ritnummer (treinnummer) */
	ritnummer?: string;
	/** Transitous trip-ID, nodig om realtime te verversen */
	tripId?: string;
	realtime: boolean;
	uitgevallen: boolean;
	/** Trein van NS: drukte, samenstelling en prijs zijn beschikbaar */
	isNS: boolean;
	polyline?: { punten: string; precisie: number };
	/** Afstand in meters (indien bekend) */
	afstand?: number;
	kleur?: string;
	tekstKleur?: string;
	meldingen: Melding[];
	drukte?: Drukte;
	rolstoel?: boolean;
	fietsen?: boolean;
}

export interface PrijsOnderdeel {
	omschrijving: string;
	/** Bedrag in centen */
	bedrag: number;
	exact: boolean;
}

export interface Prijs {
	/** Totaalbedrag in centen */
	bedrag: number;
	/** true als alle onderdelen exacte NS-prijzen zijn */
	exact: boolean;
	onderdelen: PrijsOnderdeel[];
}

export interface Advies {
	id: string;
	bron: 'transitous' | 'ns';
	vertrek: Tijd;
	aankomst: Tijd;
	/** Duur in seconden, op basis van verwachte tijden */
	duur: number;
	overstappen: number;
	legs: Leg[];
	prijs?: Prijs;
	/** Hoogste drukteverwachting van de NS-treinen in dit advies */
	drukte?: Drukte;
	meldingen?: Melding[];
}

export interface PlanAntwoord {
	adviezen: Advies[];
	bron: 'transitous' | 'ns';
	/** Uitleg als de fallback-planner is gebruikt of er iets mis ging */
	melding?: string;
	vorige?: string;
	volgende?: string;
	/** Of drukte voor minstens één advies bekend is (NS-treinen) */
	drukteBeschikbaar: boolean;
	opgehaaldOp: string;
}

export interface Vertrek {
	tijd: Tijd;
	richting: string;
	lijn: string;
	productNaam?: string;
	modus: Modus;
	vervoerder?: string;
	spoor?: string;
	geplandSpoor?: string;
	uitgevallen: boolean;
	realtime: boolean;
	tripId?: string;
	ritnummer?: string;
	isNS: boolean;
	kleur?: string;
	tekstKleur?: string;
	halteNaam?: string;
	meldingen: Melding[];
	/** Via-stations (alleen NS) */
	via?: string[];
}

export interface VertrekAntwoord {
	halte: { naam: string; stopId?: string; lat?: number; lon?: number };
	vertrekken: Vertrek[];
	bron: 'transitous' | 'ns';
	melding?: string;
	opgehaaldOp: string;
}

export interface TreinDeel {
	nummer?: string;
	type?: string;
	faciliteiten: string[];
	bakken: number;
	afbeelding?: string;
	eindbestemming?: string;
	/** Dit treinstel heeft eerste klas (ergens); zegt niets over welke bak */
	eersteKlas?: boolean;
	/** Per bak: klasse en stilte, alleen als de NS-data dat per bak geeft */
	indeling?: BakInfo[];
	/** Zijaanzicht per bak (NS Virtual Train API), in volgorde van het treinstel */
	bakAfbeeldingen?: string[];
	/** Drukteverwachting voor dit treinstel, als NS die per treinstel geeft */
	drukte?: Drukte;
}

/** De trein splitst onderweg: welk deel moet je hebben en waar gaan de andere delen heen */
export interface Splitsing {
	/** Station waar de trein splitst, als bekend */
	station?: string;
	/** Indexen in TreinInfo.delen die naar jouw uitstapstation rijden */
	jouwDelen: number[];
	/** Eindbestemming per deel-index */
	bestemmingen: { deel: number; naar: string }[];
	/** Splitst vóór je uitstapt (anders ter informatie) */
	voorUitstappen: boolean;
}

export interface RitHistorie {
	/** "2026-09-26" */
	datum: string;
	ritnummer: string;
	van?: string;
	naar?: string;
	/** Geplande vertrektijd vanaf het beginstation */
	vertrek?: string;
}

export interface BakInfo {
	eersteKlas: boolean;
	stilte: boolean;
	drukte?: Drukte;
}

export interface Instapadvies {
	/** Posities als fractie (0 = kop in rijrichting, 1 = staart) langs de trein */
	eersteKlas: { van: number; tot: number }[];
	stilte: { van: number; tot: number }[];
	/** Zijde van het perron waar de kop van de trein stopt, als bekend */
	rijrichting?: 'links' | 'rechts';
	/** Tekstuele samenvatting, bijvoorbeeld "Eerste klas: midden van de trein" */
	samenvatting: string[];
	/** Of de posities per bak uit de NS-data komen of een benadering zijn */
	nauwkeurig: boolean;
}

export interface TreinInfo {
	ritnummer: string;
	station?: string;
	type?: string;
	vervoerder?: string;
	spoor?: string;
	delen: TreinDeel[];
	aantalBakken?: number;
	normaalBakken?: number;
	ingekort: boolean;
	lengteMeter?: number;
	drukte?: Drukte;
	faciliteiten: string[];
	instapadvies?: Instapadvies;
	zitplaatsen?: number;
	splitsing?: Splitsing;
	/** Begin- en eindstation van de hele rit */
	ritVan?: string;
	ritNaar?: string;
	bron: string[];
	opgehaaldOp: string;
}

export interface VoertuigPositie {
	lat: number;
	lon: number;
	snelheid?: number;
	richting?: number;
	tijd: string;
	/** 'gps' bij echte positie (NS), 'geschat' bij interpolatie uit de dienstregeling */
	soort: 'gps' | 'geschat';
}

export type ReisStatus = 'gepland' | 'actief' | 'afgerond';

export type ProbleemSoort = 'uitval' | 'overstap' | 'vertraging' | 'spoor' | 'krap';

export interface Probleem {
	soort: ProbleemSoort;
	/** Index van de leg waar het probleem zit */
	legIndex: number;
	tekst: string;
	/** Unieke sleutel om dubbele pushmeldingen te voorkomen */
	sleutel: string;
	/** Ernstige problemen vragen om een alternatief */
	ernstig: boolean;
}

export interface Reis {
	id: string;
	status: ReisStatus;
	van: Plek;
	naar: Plek;
	advies: Advies;
	aangemaaktOp: string;
	gestartOp?: string;
	afgerondOp?: string;
	laatstBijgewerkt?: string;
	problemen?: Probleem[];
	gedeeldId?: string;
}

export interface Favoriet {
	id: string;
	naam?: string;
	van: Plek;
	naar: Plek;
	via?: Plek;
	voorkeur: Voorkeur;
}

export interface FavorietePlek {
	id: string;
	naam: string;
	plek: Plek;
}

export interface WeekItem {
	id: string;
	naam?: string;
	/** 1 = maandag … 7 = zondag */
	dagen: number[];
	/** "HH:MM" */
	tijd: string;
	soort: 'vertrek' | 'aankomst';
	van: Plek;
	naar: Plek;
	via?: Plek;
}

export interface Profiel {
	naam?: string;
	thuislocatie?: Plek;
	/** Laatste trein naar huis 's avonds vanzelf tonen als je ver van huis bent (standaard aan) */
	laatsteTrein?: 'automatisch' | 'uit';
	/** Niet meer in gebruik: snelst/goedkoopst/… zijn nu labels in de lijst */
	standaardvoorkeur?: Voorkeur;
	installatieUitlegGezien?: boolean;
}

export interface GedeeldeReis {
	uid: string;
	reisId: string;
	naam?: string;
	reis: {
		van: Plek;
		naar: Plek;
		advies: Advies;
		status: ReisStatus;
		problemen?: Probleem[];
		bijgewerktOp: string;
	};
	laatsteLocatie?: { lat: number; lng: number; tijd: string };
	/** ISO-tijdstip; in Firestore opgeslagen als Timestamp */
	verlooptOp: string;
}

/** Waarschuwing voor de laatste trein naar huis; de cron-worker stuurt de meldingen */
export interface LaatsteTreinWekker {
	uid: string;
	van: Plek;
	naar: Plek;
	advies: Advies;
	/** Sleutels van meldingen die al verstuurd zijn */
	gemeld: string[];
	aangemaaktOp: string;
}

/** Compacte kopie van een actieve reis die de cron-worker leest */
export interface ActieveReisPointer {
	uid: string;
	reisId: string;
	van: Plek;
	naar: Plek;
	advies: Advies;
	/** Sleutels van problemen waarover al een pushmelding is gestuurd */
	gemeld: string[];
	/** Einde van de reis (verwachte aankomst); daarna wordt de reis afgerond */
	eindeOp: string;
	gedeeldId?: string;
	laatsteCheck?: string;
}
