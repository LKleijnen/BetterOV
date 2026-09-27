// Achtergrond per treintype: welke trein is het, hoe oud, nieuw of ouder. Vaste gegevens (openbaar
// bekend), gekoppeld aan het type dat NS meegeeft (bijvoorbeeld "VIRM-6", "ICNG-B", "SNG 4").

export type Leeftijd = 'nieuw' | 'modern' | 'gemoderniseerd' | 'ouder';

export interface MaterieelSoort {
	/** Voorvoegsel van het type, zonder streepjes of spaties (VIRM, ICNG, SNG, …) */
	code: string;
	naam: string;
	bouwer?: string;
	/** Jaren van bouw of indienststelling */
	gebouwd: string;
	gemoderniseerd?: string;
	leeftijd: Leeftijd;
	/** Topsnelheid in km/u */
	snelheid?: number;
	dubbeldeks?: boolean;
	omschrijving: string;
}

export const LEEFTIJD_NAMEN: Record<Leeftijd, string> = {
	nieuw: 'Nieuw',
	modern: 'Modern',
	gemoderniseerd: 'Gemoderniseerd',
	ouder: 'Ouder'
};

// Langste codes eerst, zodat ICNG niet als ICM of IC wordt herkend
const SOORTEN: MaterieelSoort[] = [
	{
		code: 'ICNG',
		naam: 'Intercity Nieuwe Generatie',
		bouwer: 'Alstom',
		gebouwd: 'sinds 2023 in dienst',
		leeftijd: 'nieuw',
		snelheid: 200,
		omschrijving: 'De nieuwste intercity van NS: stil, ruime zitplaatsen, stopcontacten en een lage instap.'
	},
	{
		code: 'SNG',
		naam: 'Sprinter Nieuwe Generatie',
		bouwer: 'CAF',
		gebouwd: '2018–2021',
		leeftijd: 'nieuw',
		snelheid: 160,
		omschrijving: 'Moderne sprinter met toilet, stopcontacten en een instap zonder opstap.'
	},
	{
		code: 'FLIRT',
		naam: 'Stadler FLIRT',
		bouwer: 'Stadler',
		gebouwd: '2016–2017',
		leeftijd: 'modern',
		snelheid: 160,
		omschrijving: 'Sprinter met lage vloer, toilet en brede deuren.'
	},
	{
		code: 'SLT',
		naam: 'Sprinter Lighttrain',
		bouwer: 'Bombardier en Siemens',
		gebouwd: '2009–2012',
		leeftijd: 'modern',
		snelheid: 160,
		omschrijving: 'Sprinter voor korte afstanden met veel deuren en snel optrekken.'
	},
	{
		code: 'VIRM',
		naam: 'VIRM (dubbeldekker)',
		bouwer: 'Talbot en Bombardier',
		gebouwd: '1994–2009',
		gemoderniseerd: 'de oudste treinen in 2015–2019',
		leeftijd: 'gemoderniseerd',
		snelheid: 160,
		dubbeldeks: true,
		omschrijving: 'Dubbeldeks intercity met veel zitplaatsen; boven is het vaak rustiger.'
	},
	{
		code: 'DDZ',
		naam: 'Dubbeldeks Zonetrein',
		bouwer: 'Talbot en Bombardier',
		gebouwd: '1992–1994',
		gemoderniseerd: 'verbouwd in 2010–2013',
		leeftijd: 'gemoderniseerd',
		dubbeldeks: true,
		omschrijving: 'Dubbeldekker die als sprinter rijdt; verbouwd uit de oude dubbeldekstreinen.'
	},
	{
		code: 'ICM',
		naam: 'Intercitymaterieel (Koploper)',
		bouwer: 'Talbot',
		gebouwd: '1977–1994',
		gemoderniseerd: '2006–2011',
		leeftijd: 'ouder',
		snelheid: 140,
		omschrijving: 'De bekende Koploper met de hoge neus; de oudste intercity die nog rijdt.'
	},
	{
		code: 'ICR',
		naam: 'Intercityrijtuigen',
		gebouwd: '1980–1988',
		leeftijd: 'ouder',
		omschrijving: 'Losse rijtuigen achter een locomotief.'
	},
	{
		code: 'ICE',
		naam: 'ICE (Deutsche Bahn)',
		bouwer: 'Siemens',
		gebouwd: 'verschillende series',
		leeftijd: 'modern',
		snelheid: 300,
		omschrijving: 'Hogesnelheidstrein naar Duitsland.'
	},
	{
		code: 'WINK',
		naam: 'Stadler WINK',
		bouwer: 'Stadler',
		gebouwd: 'sinds 2021 in dienst',
		leeftijd: 'nieuw',
		omschrijving: 'Regionale trein van Arriva, ook op batterij.'
	},
	{
		code: 'GTW',
		naam: 'Stadler GTW',
		bouwer: 'Stadler',
		gebouwd: 'sinds 2006 in dienst',
		leeftijd: 'modern',
		omschrijving: 'Regionale trein met lage vloer en een motorbak in het midden.'
	}
];

function code(type: string): string {
	return type.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Achtergrond bij een treintype, of undefined als het type onbekend is */
export function materieelSoort(type: string | undefined): MaterieelSoort | undefined {
	if (!type) return undefined;
	const c = code(type);
	return SOORTEN.find((s) => c.startsWith(s.code));
}

/** Aantal bakken uit het type (VIRM-6 → 6), als dat erin staat */
export function bakkenUitType(type: string | undefined): number | undefined {
	const m = type?.match(/(\d)\s*$/);
	return m ? Number(m[1]) : undefined;
}
