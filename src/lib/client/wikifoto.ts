// Een echte foto van een voertuig: de hoofdafbeelding van het Wikipedia-artikel, met de maker en
// de licentie van Wikimedia Commons. De browser haalt dit zelf op (Wikipedia staat dat toe) en
// onthoudt het een maand.

import { lees, schrijf } from './opslag';

export interface WikiFoto {
	url: string;
	breedte?: number;
	hoogte?: number;
	/** Pagina van het bestand (Commons of Wikipedia) */
	pagina: string;
	maker?: string;
	licentie?: string;
	licentieUrl?: string;
}

const MAAND = 30 * 24 * 3600 * 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ruw = any;

/** Tekst uit HTML van Commons (de maker is vaak een link) */
export function tekstUitHtml(html: string | undefined): string | undefined {
	if (!html) return undefined;
	const tekst = html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return tekst || undefined;
}

/** Bestandsnaam uit een afbeeldings-URL van Wikimedia (ook uit een thumb-URL) */
export function bestandUitUrl(url: string): string | undefined {
	const delen = new URL(url).pathname.split('/').filter(Boolean);
	const i = delen.indexOf('thumb');
	const naam = i >= 0 ? delen[i + 3] : delen.at(-1);
	return naam ? decodeURIComponent(naam) : undefined;
}

/** Alleen gewone https-links overnemen uit wat Wikipedia en Commons teruggeven */
export function veiligeUrl(url: unknown): string | undefined {
	if (typeof url !== 'string') return undefined;
	const volledig = url.startsWith('//') ? `https:${url}` : url;
	return /^https:\/\//.test(volledig) ? volledig : undefined;
}

async function json(url: string): Promise<Ruw> {
	const r = await fetch(url, { headers: { accept: 'application/json' } });
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	return r.json();
}

export async function wikiFoto(taal: string, titel: string): Promise<WikiFoto | null> {
	const sleutel = `wikifoto:${taal}:${titel}`;
	const bewaard = lees<{ tot: number; foto: WikiFoto | null } | null>(sleutel, null);
	if (bewaard && bewaard.tot > Date.now()) return bewaard.foto;

	const samenvatting = await json(`https://${taal}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titel)}`);
	const beeld = samenvatting?.originalimage ?? samenvatting?.thumbnail;
	const bronUrl = veiligeUrl(beeld?.source);
	if (!bronUrl) {
		schrijf(sleutel, { tot: Date.now() + MAAND, foto: null });
		return null;
	}
	const bestand = bestandUitUrl(bronUrl);
	let foto: WikiFoto = {
		url: veiligeUrl(samenvatting?.thumbnail?.source) ?? bronUrl,
		breedte: beeld.width,
		hoogte: beeld.height,
		pagina: veiligeUrl(samenvatting?.content_urls?.mobile?.page) ?? `https://${taal}.wikipedia.org/wiki/${encodeURIComponent(titel)}`
	};
	if (bestand) {
		// Maker, licentie en een afbeelding van 1280 px breed via Commons
		try {
			const q = new URLSearchParams({
				action: 'query',
				titles: `File:${bestand}`,
				prop: 'imageinfo',
				iiprop: 'url|extmetadata',
				iiurlwidth: '1280',
				format: 'json',
				origin: '*'
			});
			const r = await json(`https://commons.wikimedia.org/w/api.php?${q}`);
			const pagina = Object.values<Ruw>(r?.query?.pages ?? {})[0];
			const info = pagina?.imageinfo?.[0];
			if (info) {
				const meta = info.extmetadata ?? {};
				const url = veiligeUrl(info.thumburl) ?? veiligeUrl(info.url);
				foto = {
					url: url ?? foto.url,
					breedte: url ? info.thumbwidth : foto.breedte,
					hoogte: url ? info.thumbheight : foto.hoogte,
					pagina: veiligeUrl(info.descriptionurl) ?? foto.pagina,
					maker: tekstUitHtml(meta.Artist?.value),
					licentie: tekstUitHtml(meta.LicenseShortName?.value),
					licentieUrl: veiligeUrl(meta.LicenseUrl?.value)
				};
			}
		} catch {
			// Zonder Commons-gegevens tonen we de foto met een link naar Wikipedia
		}
	}
	schrijf(sleutel, { tot: Date.now() + MAAND, foto });
	return foto;
}
