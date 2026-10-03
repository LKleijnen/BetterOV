// Achtergrond per voertuigtype voor de voertuigenpagina en Voertuiginfo: versies, techniek,
// kosten, geschiedenis en leuke feiten. De inhoud staat in data/voertuigen.json (uit openbare
// bronnen, met de bronnen erbij) en wordt pas geladen als je hem nodig hebt.

import { materieelSoort } from './materieel';

export interface VoertuigVariant {
	code: string;
	naam: string;
	omschrijving: string;
	herkenning?: string;
	/** Nummerreeksen van de treinstellen van deze versie */
	nummers?: [number, number][];
	bakken?: string;
	zitplaatsen?: string;
	gebouwd?: string;
	gemoderniseerd?: string;
}

export interface Voertuig {
	id: string;
	/** Code zoals in materieel.ts (VIRM, ICNG, …) */
	code: string;
	groep: string;
	naam: string;
	soort: 'trein' | 'tram' | 'metro';
	vervoerders?: string;
	kort: string;
	varianten: VoertuigVariant[];
	techniek: { label: string; waarde: string }[];
	kosten?: string;
	geschiedenis: string[];
	feiten: string[];
	bronnen: { titel: string; url: string }[];
	/** Wikipedia-artikel, voor de foto */
	wikipedia?: { taal: string; titel: string } | null;
}

let lading: Promise<Voertuig[]> | undefined;

/** Alle voertuigen (één keer geladen) */
export function laadVoertuigen(): Promise<Voertuig[]> {
	lading ??= import('./data/voertuigen.json').then((m) => m.default as unknown as Voertuig[]);
	return lading;
}

const isNS = (vervoerder?: string) => !vervoerder || /^NS\b|Nederlandse Spoorwegen/i.test(vervoerder.trim());

/** Het voertuig bij een treintype; bij de FLIRT telt de vervoerder (NS of regionaal) */
export function voertuigVoorType(lijst: Voertuig[], type: string | undefined, vervoerder?: string): Voertuig | undefined {
	const code = materieelSoort(type)?.code;
	if (!code) return undefined;
	const kandidaten = lijst.filter((v) => v.code === code);
	if (kandidaten.length < 2) return kandidaten[0];
	return kandidaten.find((v) => (isNS(vervoerder) ? !v.id.endsWith('-regio') : v.id.endsWith('-regio'))) ?? kandidaten[0];
}

/** De versie bij een treinstelnummer, als dat in een bekende reeks valt */
export function variantVoorNummer(v: Voertuig, nummer: string | undefined): number {
	const n = Number(nummer);
	if (!nummer || !Number.isFinite(n)) return -1;
	return v.varianten.findIndex((va) => va.nummers?.some(([van, tot]) => n >= van && n <= tot));
}

/** Anker op de voertuigpagina voor een versie */
export const variantAnker = (index: number) => `versie-${index + 1}`;

export interface Treffer {
	voertuig: Voertuig;
	/** Bij zoeken op een treinstelnummer: de versie waar het in valt */
	variant?: number;
}

const normaal = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

/** Zoeken op naam, code, versie, vervoerder of treinstelnummer */
export function zoekVoertuigen(lijst: Voertuig[], zoek: string): Treffer[] {
	const z = normaal(zoek);
	if (!z) return lijst.map((voertuig) => ({ voertuig }));
	if (/^\d{3,5}$/.test(z)) {
		const opNummer = lijst
			.map((voertuig) => ({ voertuig, variant: variantVoorNummer(voertuig, z) }))
			.filter((t) => t.variant >= 0);
		if (opNummer.length) return opNummer;
	}
	const woorden = z.split(' ');
	const past = (tekst: string) => woorden.every((w) => normaal(tekst).includes(w));
	// Eerst de voertuigen waarvan de naam zelf past, dan die waar het in een versie of vervoerder staat
	const opNaam = lijst.filter((v) => past(`${v.naam} ${v.code}`));
	const overig = lijst.filter(
		(v) => !opNaam.includes(v) && past([v.naam, v.code, v.vervoerders ?? '', v.groep, ...v.varianten.flatMap((va) => [va.code, va.naam])].join(' '))
	);
	return [...opNaam, ...overig].map((voertuig) => ({ voertuig }));
}
