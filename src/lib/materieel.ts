// Achtergrond per treintype: welke trein is het, hoe oud, nieuw of ouder. NS en de planner geven
// alleen een typenaam ("VIRM-6", "ICNG-B", "SNG 4", "FLIRT 3 FFF", "ICE"); de rest staat hier vast,
// op basis van openbaar bekende gegevens per type (niet per treinstel). Nieuw type erbij: voeg een
// regel toe aan SOORTEN; de volgorde telt (specifieke codes vóór algemene).

export type Leeftijd = 'nieuw' | 'modern' | 'gemoderniseerd' | 'ouder';

export interface MaterieelSoort {
	/** Voorvoegsel van het type, zonder streepjes of spaties (VIRM, ICNG, SNG, …) */
	code: string;
	/** Andere namen waaronder het type voorkomt */
	ook?: string[];
	naam: string;
	/** Wie ermee rijdt, als dat niet alleen NS is */
	vervoerders?: string;
	bouwer?: string;
	/** Bouwjaren */
	gebouwd?: string;
	/** Sinds wanneer reizigers ermee rijden */
	inDienst?: string;
	gemoderniseerd?: string;
	leeftijd?: Leeftijd;
	/** Snelheid in km/u in de dienstregeling */
	snelheid?: number;
	snelheidNoot?: string;
	dubbeldeks?: boolean;
	omschrijving: string;
}

export const LEEFTIJD_NAMEN: Record<Leeftijd, string> = {
	nieuw: 'Nieuw',
	modern: 'Modern',
	gemoderniseerd: 'Gemoderniseerd',
	ouder: 'Ouder'
};

const SOORTEN: MaterieelSoort[] = [
	// ---------- NS: intercity ----------
	{
		code: 'ICNG',
		naam: 'Intercity Nieuwe Generatie (ICNG)',
		bouwer: 'Alstom (Coradia Stream)',
		inDienst: 'sinds april 2023',
		leeftijd: 'nieuw',
		snelheid: 200,
		snelheidNoot: 'op de hsl, elders 160',
		omschrijving: 'De nieuwste intercity van NS. Vervangt de Koploper en rijdt ook naar Brussel.'
	},
	{
		code: 'VIRM',
		naam: 'VIRM (dubbeldekker)',
		bouwer: 'Talbot en De Dietrich',
		gebouwd: '1994–2009',
		gemoderniseerd: 'vanaf 2016',
		leeftijd: 'gemoderniseerd',
		snelheid: 140,
		dubbeldeks: true,
		omschrijving: 'Dubbeldeks intercity met veel zitplaatsen; boven is het vaak rustiger.'
	},
	{
		code: 'DDZ',
		ook: ['NID'],
		naam: 'DDZ (dubbeldekker)',
		gebouwd: 'jaren 90',
		gemoderniseerd: '2009–2014, verbouwd door NedTrain',
		inDienst: 'als DDZ sinds 2012',
		leeftijd: 'gemoderniseerd',
		dubbeldeks: true,
		omschrijving: 'Dubbeldeks intercity, verbouwd uit oudere dubbeldekkers. Ook wel NID genoemd (Nieuwe Intercity Dubbeldekker).'
	},
	{
		code: 'ICM',
		ook: ['KOPLOPER'],
		naam: 'Koploper (ICM)',
		bouwer: 'Talbot',
		inDienst: 'sinds 1977',
		gemoderniseerd: '2006–2011',
		leeftijd: 'ouder',
		snelheid: 140,
		omschrijving: 'De bekende intercity met de hoge neus. NS vervangt hem versneld door de ICNG; de meeste rijden al niet meer.'
	},
	{
		code: 'ICR',
		naam: 'Intercityrijtuigen (ICR)',
		gebouwd: 'jaren 80',
		leeftijd: 'ouder',
		omschrijving: 'Losse rijtuigen achter een locomotief. Rijden bijna niet meer: de ICNG heeft ze vervangen, ook naar Brussel.'
	},
	// ---------- NS: sprinter ----------
	{
		code: 'SNG',
		naam: 'Sprinter Nieuwe Generatie (SNG)',
		bouwer: 'CAF (Civity)',
		inDienst: 'sinds december 2018',
		leeftijd: 'nieuw',
		snelheid: 160,
		omschrijving: 'Moderne sprinter met toilet en een lage instap.'
	},
	{
		code: 'SLT',
		naam: 'Sprinter Lighttrain (SLT)',
		bouwer: 'Bombardier en Siemens',
		gebouwd: '2007–2012',
		inDienst: 'sinds 2009',
		leeftijd: 'modern',
		snelheid: 140,
		omschrijving: 'Sprinter voor korte afstanden met veel deuren en snel optrekken.'
	},
	{
		code: 'FLIRT',
		naam: 'Stadler FLIRT',
		vervoerders: 'NS (sprinter), Arriva, Keolis',
		bouwer: 'Stadler',
		inDienst: 'sinds 2016',
		leeftijd: 'modern',
		omschrijving: 'Elektrische trein met een lage vloer en brede deuren. NS kreeg er 58 in 2016–2017; Arriva rijdt ermee in Limburg en Keolis in Overijssel en op de Valleilijn.'
	},
	// ---------- Regionale vervoerders ----------
	{
		code: 'WINK',
		naam: 'Stadler WINK',
		vervoerders: 'Arriva',
		bouwer: 'Stadler',
		inDienst: 'sinds april 2021',
		leeftijd: 'nieuw',
		omschrijving: 'Regionale trein in Friesland en Groningen. Rijdt op biodiesel, met een batterij die helpt bij het optrekken.'
	},
	{
		code: 'GTW',
		ook: ['SPURT'],
		naam: 'Stadler GTW',
		vervoerders: 'Arriva (ook als Spurt), Qbuzz',
		bouwer: 'Stadler',
		leeftijd: 'modern',
		omschrijving: 'Regionale trein met een kort motordeel in het midden, als diesel- of elektrische versie. In het noorden heet hij bij Arriva Spurt.'
	},
	{
		code: 'LINT',
		naam: 'Alstom LINT 41',
		vervoerders: 'Arriva',
		bouwer: 'Alstom',
		omschrijving: 'Dieseltrein voor regionale lijnen, onder meer op de Maaslijn.'
	},
	{
		code: 'PROTOS',
		naam: 'Protos',
		vervoerders: 'Keolis (Valleilijn)',
		bouwer: 'FTD (Dessau)',
		inDienst: 'sinds 2007',
		leeftijd: 'modern',
		omschrijving: 'Elektrische trein op de Valleilijn (Amersfoort – Ede-Wageningen). Er zijn er maar vijf van; ze worden nu vernieuwd.'
	},
	// ---------- Internationaal ----------
	{
		code: 'E320',
		naam: 'Eurostar e320',
		vervoerders: 'Eurostar',
		bouwer: 'Siemens (Velaro)',
		leeftijd: 'modern',
		snelheid: 320,
		omschrijving: 'Hogesnelheidstrein van 16 rijtuigen en bijna 400 meter lang (nodig voor de Kanaaltunnel). Rijdt ook tussen Amsterdam en Parijs.'
	},
	{
		code: 'PBKA',
		ook: ['THALYS'],
		naam: 'Eurostar (de rode, voorheen Thalys)',
		vervoerders: 'Eurostar',
		bouwer: 'Alstom (TGV)',
		inDienst: 'sinds 1996',
		leeftijd: 'ouder',
		snelheid: 300,
		omschrijving: 'Hogesnelheidstrein uit de TGV-familie tussen Parijs, Brussel, Keulen en Amsterdam.'
	},
	{
		code: 'EUROSTAR',
		naam: 'Eurostar',
		vervoerders: 'Eurostar',
		snelheid: 300,
		omschrijving: 'Hogesnelheidstrein naar Brussel, Parijs en Londen. De vroegere Thalys heet nu ook Eurostar.'
	},
	{
		code: 'ICE',
		naam: 'ICE',
		vervoerders: 'Deutsche Bahn',
		bouwer: 'Siemens',
		leeftijd: 'modern',
		snelheid: 300,
		snelheidNoot: 'in Duitsland',
		omschrijving: 'Hogesnelheidstrein van Deutsche Bahn tussen Amsterdam en Duitsland.'
	},
	{
		code: 'NIGHTJET',
		naam: 'Nightjet',
		vervoerders: 'ÖBB (Oostenrijk)',
		inDienst: 'nieuwe generatie sinds mei 2025',
		leeftijd: 'nieuw',
		omschrijving: 'Nachttrein naar Wenen en Innsbruck, met zitplaatsen, ligplaatsen, mini-cabines en slaapcoupés.'
	},
	{
		code: 'EUROPEANSLEEPER',
		naam: 'European Sleeper',
		vervoerders: 'European Sleeper',
		inDienst: 'sinds mei 2023',
		omschrijving: 'Nachttrein van Brussel en Amsterdam naar Berlijn, Dresden en Praag, met zitplaatsen, ligplaatsen en slaapcoupés.'
	}
];

const normaal = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Achtergrond bij een treintype, of undefined als het type onbekend is */
export function materieelSoort(type: string | undefined): MaterieelSoort | undefined {
	if (!type) return undefined;
	const geheel = normaal(type);
	// Losse woorden, zodat ook "Arriva GTW 2/8" of "FLIRT 3 FFF" herkend wordt
	const woorden = type
		.toUpperCase()
		.split(/[^A-Z0-9]+/)
		.filter(Boolean);
	return SOORTEN.find((s) =>
		[s.code, ...(s.ook ?? [])].some((c) => geheel.startsWith(c) || woorden.some((w) => w.startsWith(c)) || (c.length >= 8 && geheel.includes(c)))
	);
}

/** Alle bekende types (voor tests en overzichten) */
export function alleSoorten(): readonly MaterieelSoort[] {
	return SOORTEN;
}

/** Aantal bakken uit het type (VIRM-6 → 6), als dat erin staat */
export function bakkenUitType(type: string | undefined): number | undefined {
	const m = type?.match(/(\d)\s*$/);
	return m ? Number(m[1]) : undefined;
}
