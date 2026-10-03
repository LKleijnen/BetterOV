// Per treinstel: welke versie het is (en hoe modern), en waar de 1e klas en stilte zitten als NS
// dat niet per bak meegeeft. Gebaseerd op openbaar bekende gegevens per type (Wikipedia, railwiki,
// NS-community) en de nummerreeksen van het materieel. De indeling is vanaf één kop geteld; omdat
// een treinstel ook andersom kan staan, is een bak alleen zeker als hij het in beide standen is.

import { materieelSoort, type Leeftijd } from './materieel';

const ROMEINS: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

// Het nummer van een treinstel begint met een reeks die bij het aantal bakken hoort (9401 is een VIRM van 4)
const NUMMERREEKSEN: Record<string, Record<string, number>> = {
	VIRM: { '94': 4, '95': 4, '86': 6, '87': 6 },
	DDZ: { '75': 4, '76': 6 },
	ICM: { '40': 3, '42': 4 },
	SNG: { '23': 3, '30': 3, '27': 4 },
	SLT: { '24': 4, '26': 6 },
	FLIRT: { '22': 3, '25': 4 },
	ICNG: { '31': 5, '32': 8, '33': 8 }
};

/** Aantal bakken uit het materieelnummer, als het type bekend is */
export function bakkenUitNummer(type: string | undefined, nummer: string | undefined): number | undefined {
	const code = materieelSoort(type)?.code;
	if (!code || !nummer || !/^\d{4}$/.test(nummer)) return undefined;
	return NUMMERREEKSEN[code]?.[nummer.slice(0, 2)];
}

/** Aantal bakken uit het type: "VIRM-6", "SNG 4", "VIRMm1 VI", "ICNG-VIII" (anders undefined) */
export function bakkenUitTypeNaam(type: string | undefined): number | undefined {
	if (!type) return undefined;
	const t = type.toUpperCase().trim();
	const romeins = t.match(/[\s-](II|III|IV|V|VI|VII|VIII)$/);
	if (romeins) return ROMEINS[romeins[1]];
	const cijfer = t.match(/[\s-]([2-9])(?:\s*FFF)?$/);
	return cijfer ? Number(cijfer[1]) : undefined;
}

export interface Variant {
	/** Korte naam, bijvoorbeeld "VIRMm1" of "VIRM (4e serie)" */
	naam: string;
	leeftijd: Leeftijd;
	/** Hoger is moderner; om gekoppelde treinstellen te vergelijken */
	rang: number;
	/** Wanneer gebouwd of vernieuwd, kort */
	uitleg: string;
}

interface VariantRegel {
	code: string;
	/** Herkenning aan de typenaam van NS */
	typePatroon?: RegExp;
	/** Herkenning aan het materieelnummer */
	nummers?: [number, number][];
	variant: Variant;
}

const VARIANTEN: VariantRegel[] = [
	{
		code: 'VIRM',
		typePatroon: /VIRM\s*M\s*1|VIRMM1/,
		nummers: [
			[9401, 9481],
			[8601, 8681]
		],
		variant: { naam: 'VIRMm1', leeftijd: 'gemoderniseerd', rang: 68, uitleg: 'vernieuwd 2016–2020' }
	},
	{
		code: 'VIRM',
		typePatroon: /VIRM\s*M\s*[23]|VIRMM[23]|FLOW/,
		nummers: [
			[9501, 9546],
			[8701, 8746]
		],
		variant: { naam: 'VIRMm2/3', leeftijd: 'gemoderniseerd', rang: 72, uitleg: 'vernieuwd 2021–2024 ("flow")' }
	},
	{
		code: 'VIRM',
		nummers: [[9547, 9597]],
		variant: { naam: 'VIRM (4e serie)', leeftijd: 'modern', rang: 55, uitleg: 'gebouwd 2008–2009, wordt 2026–2028 vernieuwd' }
	},
	{ code: 'ICNG', variant: { naam: 'ICNG', leeftijd: 'nieuw', rang: 100, uitleg: 'in dienst sinds 2023' } },
	{ code: 'SNG', variant: { naam: 'SNG', leeftijd: 'nieuw', rang: 90, uitleg: 'in dienst sinds 2018' } },
	{ code: 'FLIRT', variant: { naam: 'FLIRT', leeftijd: 'modern', rang: 80, uitleg: 'in dienst sinds 2016' } },
	{ code: 'SLT', variant: { naam: 'SLT', leeftijd: 'modern', rang: 60, uitleg: 'in dienst sinds 2009' } },
	{ code: 'DDZ', variant: { naam: 'DDZ', leeftijd: 'gemoderniseerd', rang: 50, uitleg: 'verbouwd 2009–2014' } },
	{ code: 'ICM', variant: { naam: 'ICMm (Koploper)', leeftijd: 'ouder', rang: 30, uitleg: 'gebouwd 1983–1994, vernieuwd 2006–2011' } }
];

/** Regionale vervoerders rijden ook met een FLIRT, maar met een andere indeling dan die van NS */
function nsMaterieel(code: string, vervoerder?: string): boolean {
	return code !== 'FLIRT' || !vervoerder || /^NS\b|Nederlandse Spoorwegen/i.test(vervoerder.trim());
}

/** Welke versie dit treinstel is, als dat uit het type of het nummer te halen is */
export function treinVariant(type: string | undefined, nummer?: string, vervoerder?: string): Variant | undefined {
	const soort = materieelSoort(type);
	if (!soort || !nsMaterieel(soort.code, vervoerder)) return undefined;
	const t = (type ?? '').toUpperCase();
	const n = Number(nummer);
	const regels = VARIANTEN.filter((r) => r.code === soort.code);
	return (
		regels.find((r) => r.typePatroon?.test(t))?.variant ??
		(Number.isFinite(n) ? regels.find((r) => r.nummers?.some(([van, tot]) => n >= van && n <= tot))?.variant : undefined) ??
		regels.find((r) => !r.typePatroon && !r.nummers)?.variant
	);
}

// ---------- Indeling per bak ----------

interface Indeling {
	/** Bakken met (ook) 1e klas, vanaf één kop geteld (0 = eerste bak) */
	eersteKlas: number[];
	/** Bakken met een stiltecoupé */
	stilte: number[];
	/** Is de plek van de stilte goed bekend? Anders tonen we hem hooguit als "misschien" */
	stilteZeker?: boolean;
}

// Sleutel: code van het type + aantal bakken
const INDELINGEN: Record<string, Indeling> = {
	'VIRM-4': { eersteKlas: [1, 2], stilte: [1, 2] },
	'VIRM-6': { eersteKlas: [1, 2, 4], stilte: [1, 4] },
	'DDZ-4': { eersteKlas: [1, 3], stilte: [1, 3] },
	'DDZ-6': { eersteKlas: [1, 3, 5], stilte: [1, 3, 5] },
	'ICM-3': { eersteKlas: [1], stilte: [1], stilteZeker: true },
	'ICM-4': { eersteKlas: [2], stilte: [2], stilteZeker: true },
	'ICNG-5': { eersteKlas: [2, 3], stilte: [2] },
	// Sprinters: sinds de ombouw van 2025–2026 nog 1e klas aan één kop (welke is niet bekend)
	'SNG-3': { eersteKlas: [0], stilte: [] },
	'SNG-4': { eersteKlas: [0], stilte: [] },
	'SLT-4': { eersteKlas: [0], stilte: [] },
	// De 1e klas in de middelste bak is in 2016 tweede klas geworden
	'SLT-6': { eersteKlas: [0, 5], stilte: [] },
	'FLIRT-3': { eersteKlas: [0], stilte: [] },
	'FLIRT-4': { eersteKlas: [0, 3], stilte: [] }
};

export type Zekerheid = 'ja' | 'misschien';

export interface VasteBak {
	eersteKlas?: Zekerheid;
	stilte?: Zekerheid;
}

/**
 * 1e klas en stilte per bak volgens de vaste indeling van het type. Een bak is 'ja' als hij het in
 * beide standen van het treinstel is, en 'misschien' als het afhangt van hoe de trein staat.
 * Stilte alleen als het treinstel volgens NS een stiltecoupé heeft. Undefined als het type onbekend is.
 */
export function vasteIndeling(type: string | undefined, bakken: number, heeftStilte: boolean, vervoerder?: string): VasteBak[] | undefined {
	const soort = materieelSoort(type);
	if (!soort || bakken < 1 || !nsMaterieel(soort.code, vervoerder)) return undefined;
	const indeling = INDELINGEN[`${soort.code}-${bakken}`];
	if (!indeling) return undefined;
	const zeker = (lijst: number[], j: number, altijdOnzeker = false): Zekerheid | undefined => {
		const heen = lijst.includes(j);
		const terug = lijst.includes(bakken - 1 - j);
		if (!heen && !terug) return undefined;
		return heen && terug && !altijdOnzeker ? 'ja' : 'misschien';
	};
	return Array.from({ length: bakken }, (_, j) => ({
		eersteKlas: zeker(indeling.eersteKlas, j),
		stilte: heeftStilte ? zeker(indeling.stilte, j, !indeling.stilteZeker) : undefined
	}));
}
