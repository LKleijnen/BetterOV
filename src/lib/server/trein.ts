// Treininformatie voor één NS-rit: samenstelling, drukte, lengte t.o.v. normaal en instapadvies.

import type { Instapadvies, Splitsing, TreinDeel, TreinInfo } from '../types';
import { nsRitHaltes, nsRitRuw, nsSamenstelling, nsStations, ritHalteBij, stationVoorPlek, type NsRitHalte, type NsSamenstelling } from './ns';

type Bereik = { van: number; tot: number };

function samenvoegen(bereiken: Bereik[]): Bereik[] {
	const gesorteerd = [...bereiken].sort((a, b) => a.van - b.van);
	const uit: Bereik[] = [];
	for (const b of gesorteerd) {
		const laatste = uit[uit.length - 1];
		if (laatste && b.van <= laatste.tot + 1e-9) laatste.tot = Math.max(laatste.tot, b.tot);
		else uit.push({ ...b });
	}
	return uit;
}

function beschrijf(bereiken: Bereik[], rijrichting?: 'links' | 'rechts'): string {
	const delen = bereiken.map((b) => {
		let midden = (b.van + b.tot) / 2;
		if (!rijrichting) return midden < 0.34 ? 'links' : midden > 0.66 ? 'rechts' : 'midden';
		// Kop van de trein: bij rijrichting links is dat de linkerkant van de tekening
		if (rijrichting === 'rechts') midden = 1 - midden;
		return midden < 0.34 ? 'voorin' : midden > 0.66 ? 'achterin' : 'midden';
	});
	const uniek = [...new Set(delen)];
	return uniek.join(' en ');
}

/** Welk treinstel, als je vanaf de kop telt (bij onbekende rijrichting zoals getekend) */
function deelPositie(i: number, aantal: number, rijrichting?: 'links' | 'rechts'): string {
	if (aantal === 1) return 'in de trein';
	const index = rijrichting === 'rechts' ? aantal - 1 - i : i;
	if (index === 0) return rijrichting ? 'in het voorste treinstel' : 'in het linker treinstel';
	if (index === aantal - 1) return rijrichting ? 'in het achterste treinstel' : 'in het rechter treinstel';
	return 'in het middelste treinstel';
}

export function berekenInstapadvies(s: NsSamenstelling): Instapadvies | undefined {
	const totaal = s.delen.reduce((t, d) => t + Math.max(1, d.bakken), 0);
	if (!totaal) return undefined;
	const eersteKlas: Bereik[] = [];
	const stilte: Bereik[] = [];
	// Alleen per bak tekenen als de NS-data per bak zegt waar het is; anders per treinstel benoemen
	const perDeelStilte: number[] = [];
	const perDeelEerste: number[] = [];
	let positie = 0;
	s.delen.forEach((d, i) => {
		const n = Math.max(1, d.bakken);
		const heeftIndeling = !!d.indeling && d.indeling.length === n;
		if (heeftIndeling) {
			d.indeling!.forEach((b, j) => {
				const r = { van: (positie + j) / totaal, tot: (positie + j + 1) / totaal };
				if (b.eersteKlas) eersteKlas.push(r);
				if (b.stilte) stilte.push(r);
			});
		}
		if (!heeftIndeling || !d.indeling!.some((b) => b.stilte)) {
			if (d.faciliteiten.some((f) => f.includes('STILTE'))) perDeelStilte.push(i);
		}
		if (!heeftIndeling || !d.indeling!.some((b) => b.eersteKlas)) {
			if (s.eersteKlasPerDeel[i] || d.eersteKlas) perDeelEerste.push(i);
		}
		positie += n;
	});
	const ek = samenvoegen(eersteKlas);
	const st = samenvoegen(stilte);
	// Drukte per bak, als NS die geeft: waar is het waarschijnlijk het drukst en waar rustiger
	const druk: Bereik[] = [];
	const rustig: Bereik[] = [];
	let pos = 0;
	s.delen.forEach((d) => {
		const n = Math.max(1, d.bakken);
		if (d.indeling?.length === n) {
			d.indeling.forEach((b, j) => {
				const r = { van: (pos + j) / totaal, tot: (pos + j + 1) / totaal };
				if (b.drukte === 'hoog') druk.push(r);
				if (b.drukte === 'laag') rustig.push(r);
			});
		}
		pos += n;
	});
	const nauwkeurig = ek.length > 0 || st.length > 0;
	const samenvatting: string[] = [];
	const plek = s.rijrichting ? '' : ' (zoals getekend)';
	const perDeel = (delen: number[]) => [...new Set(delen.map((i) => deelPositie(i, s.delen.length, s.rijrichting)))].join(' en ');
	if (ek.length) samenvatting.push(`Eerste klas: ${beschrijf(ek, s.rijrichting)}${plek}`);
	else if (perDeelEerste.length) samenvatting.push(`Eerste klas: ${perDeel(perDeelEerste)}`);
	if (st.length) samenvatting.push(`Stiltecoupé: ${beschrijf(st, s.rijrichting)}${plek}`);
	else if (perDeelStilte.length) samenvatting.push(`Stiltecoupé: ${perDeel(perDeelStilte)}`);
	if (druk.length && rustig.length) {
		samenvatting.push(`Waarschijnlijk het drukst: ${beschrijf(samenvoegen(druk), s.rijrichting)}`);
		samenvatting.push(`Rustiger: ${beschrijf(samenvoegen(rustig), s.rijrichting)}`);
	}
	if (!samenvatting.length) samenvatting.push('De NS-data bevat voor deze trein geen indeling.');
	return { eersteKlas: ek, stilte: st, rijrichting: s.rijrichting, samenvatting, nauwkeurig };
}

export interface TreinVraag {
	stationCode?: string;
	stationNaam?: string;
	lat?: number;
	lon?: number;
	datumTijd?: string;
	/** Uitstapstation en richting van jouw rit, om te bepalen in welk deel je moet zitten */
	naar?: string;
	richting?: string;
	/** Ruwe NS-data meesturen (voor controle en debuggen) */
	ruw?: boolean;
}

function zelfdeNaam(a?: string, b?: string): boolean {
	const n = (x: string) => x.toLowerCase().replace(/^station\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
	return !!a && !!b && (n(a) === n(b) || n(a).startsWith(`${n(b)} `) || n(b).startsWith(`${n(a)} `));
}

/**
 * De haltes van één tak van de rit, in volgorde. Splitst de trein onderweg, dan staan in de
 * NS-ritdata soms de haltes van beide takken (met meerdere volgende haltes op het splitsstation);
 * we volgen dan de tak naar je uitstapstation, anders die naar de richting, anders die met dit
 * ritnummer. Zonder volgende-informatie is de lijst al één lijn.
 */
export function ritPad(rit: NsRitHalte[], v: { naar?: string; richting?: string; ritnummer?: string } = {}): NsRitHalte[] {
	const opId = new Map(rit.filter((h) => h.id).map((h) => [h.id!, h]));
	if (!rit.some((h) => (h.volgende?.length ?? 0) > 1) || opId.size < rit.length) return rit;
	const takVanaf = (id: string): NsRitHalte[] => {
		const uit: NsRitHalte[] = [];
		const gezien = new Set<string>();
		let h = opId.get(id);
		while (h && !gezien.has(h.id!)) {
			gezien.add(h.id!);
			uit.push(h);
			h = h.volgende?.length ? opId.get(h.volgende[0]) : undefined;
		}
		return uit;
	};
	const pad: NsRitHalte[] = [];
	const gezien = new Set<string>();
	let h: NsRitHalte | undefined = rit[0];
	while (h && !gezien.has(h.id!)) {
		gezien.add(h.id!);
		pad.push(h);
		const volgende: string[] = h.volgende ?? [];
		if (volgende.length > 1) {
			const takken = volgende.map((id) => ({ id, haltes: takVanaf(id) }));
			const past = (f: (x: NsRitHalte) => boolean) => takken.find((t) => t.haltes.some(f));
			const huidig: NsRitHalte = h;
			const keuze =
				(v.naar ? past((x) => zelfdeNaam(x.naam, v.naar)) : undefined) ??
				(v.richting ? takken.find((t) => zelfdeNaam(t.haltes.at(-1)?.naam, v.richting)) : undefined) ??
				(v.ritnummer
					? takken.find((t) => huidig.vertrekken?.some((d) => d.ritnummer === v.ritnummer && zelfdeNaam(d.naar, t.haltes.at(-1)?.naam)))
					: undefined) ??
				takken[0];
			h = opId.get(keuze.id);
		} else h = volgende.length ? opId.get(volgende[0]) : undefined;
	}
	return pad;
}

/** Eindhalte van elke andere tak die bij deze halte afsplitst */
function andereTakken(rit: NsRitHalte[], halte: NsRitHalte, pad: NsRitHalte[]): string[] {
	const opId = new Map(rit.filter((h) => h.id).map((h) => [h.id!, h]));
	const inPad = new Set(pad.map((h) => h.id));
	return (halte.volgende ?? [])
		.filter((id) => !inPad.has(id))
		.map((id) => {
			let h = opId.get(id);
			const gezien = new Set<string>();
			while (h?.volgende?.length && !gezien.has(h.id!)) {
				gezien.add(h.id!);
				const volgende = opId.get(h.volgende[0]);
				if (!volgende) break;
				h = volgende;
			}
			return h?.naam;
		})
		.filter((n): n is string => !!n);
}

const aantalDelen = (h?: NsRitHalte) => h?.materieel?.aantalDelen ?? (h?.materieel?.delen.length || undefined);

/**
 * Splitst de trein onderweg (of blijft er een deel achter)? NS geeft dat op verschillende manieren,
 * en nog niet bevestigd met echte data, dus we kijken naar alle signalen:
 * - in de ritdata: een halte met meer dan één volgende halte, status SPLIT, of meerdere vertrekken
 *   met verschillende bestemmingen;
 * - minder treinstellen dan bij je instapstation;
 * - verschillende eindbestemmingen per treinstel (Virtual Train API).
 * Jouw deel is het deel dat bij je uitstapstation nog meerijdt, of anders het deel dat naar de
 * eindbestemming van jouw tak gaat.
 */
export function bepaalSplitsing(
	delen: TreinDeel[],
	rit: NsRitHalte[],
	v: { stationNaam?: string; naar?: string; richting?: string; ritnummer?: string }
): Splitsing | undefined {
	const pad = ritPad(rit, v);
	const stoppend = pad.filter((h) => h.status !== 'PASSING');
	const iVan = Math.max(0, stoppend.findIndex((h) => zelfdeNaam(h.naam, v.stationNaam)));
	const iNaar = v.naar ? stoppend.findIndex((h, i) => i > iVan && zelfdeNaam(h.naam, v.naar)) : -1;
	const eind = stoppend.at(-1);

	// ---------- Waar splitst hij? ----------
	let iSplits = -1;
	let zeker = false;
	let anderen: string[] = [];
	let vertrekNummers: string[] | undefined;
	for (let i = iVan + 1; i < stoppend.length - 1; i++) {
		const h = stoppend[i];
		const takken = andereTakken(rit, h, pad);
		const bestemmingen = [...new Set((h.vertrekken ?? []).map((d) => d.naar).filter((n): n is string => !!n))];
		if (takken.length || String(h.status).toUpperCase() === 'SPLIT' || bestemmingen.length > 1) {
			iSplits = i;
			zeker = true;
			const jouw = (h.vertrekken ?? []).find((d) => zelfdeNaam(d.naar, eind?.naam) || (v.ritnummer && d.ritnummer === v.ritnummer));
			vertrekNummers = jouw?.nummers.length ? jouw.nummers : undefined;
			anderen = takken.length ? takken : bestemmingen.filter((b) => !zelfdeNaam(b, eind?.naam));
			break;
		}
	}
	if (iSplits < 0) {
		const begin = aantalDelen(stoppend[iVan]);
		for (let i = iVan + 1; i < stoppend.length && begin; i++) {
			const n = aantalDelen(stoppend[i]);
			if (n !== undefined && n < begin) {
				iSplits = i;
				break;
			}
		}
	}

	// ---------- Per treinstel: eindbestemming uit de Virtual Train API ----------
	const perDeel = delen.map((d, deel) => ({ deel, naar: d.eindbestemming ?? '' })).filter((b) => b.naar);
	const perTreinstel = new Set(perDeel.map((b) => b.naar.toLowerCase())).size > 1;
	// Zegt NS per treinstel dat alles naar dezelfde bestemming gaat, dan telt alleen een duidelijke splitsing in de rit
	const allesZelfde = !perTreinstel && delen.length > 0 && perDeel.length === delen.length;
	if ((!perTreinstel && iSplits < 0) || (allesZelfde && !zeker)) return undefined;

	// ---------- Welke treinstellen zijn van jou? ----------
	const nummersBij = (h?: NsRitHalte) => new Set((h?.materieel?.delen ?? []).map((d) => d.nummer).filter(Boolean));
	// Treinstellen die na de splitsing nog in jouw tak rijden: bij je uitstapstation, of anders aan het eind
	const naSplitsing = iNaar >= 0 && iNaar >= iSplits ? stoppend[iNaar] : eind;
	const metNummer = (nummers: Set<string | undefined>) =>
		delen.map((d, i) => (d.nummer && nummers.has(d.nummer) ? i : -1)).filter((i) => i >= 0);
	let jouwDelen = vertrekNummers ? metNummer(new Set(vertrekNummers)) : [];
	if (!jouwDelen.length || jouwDelen.length === delen.length) jouwDelen = metNummer(nummersBij(naSplitsing));
	if ((!jouwDelen.length || jouwDelen.length === delen.length) && perTreinstel) {
		const doel = v.richting ?? eind?.naam;
		jouwDelen = delen.map((d, i) => (zelfdeNaam(d.eindbestemming, doel) ? i : -1)).filter((i) => i >= 0);
	}
	if (jouwDelen.length === delen.length) jouwDelen = [];

	const jouwBestemming = perTreinstel ? undefined : eind?.naam;
	// Zonder eindbestemming per treinstel: de bestemming per deel afleiden als we weten welke van jou zijn
	const bestemmingen = perTreinstel
		? perDeel
		: jouwDelen.length && jouwBestemming
			? delen.map((_, deel) => ({ deel, naar: jouwDelen.includes(deel) ? jouwBestemming : (anderen.length === 1 ? anderen[0] : '') })).filter((b) => b.naar)
			: [];
	if (perTreinstel && !jouwDelen.length) return undefined;

	return {
		station: iSplits >= 0 ? stoppend[iSplits].naam : undefined,
		jouwDelen,
		bestemmingen,
		jouwBestemming: perTreinstel ? undefined : jouwBestemming,
		andereBestemmingen: perTreinstel || !anderen.length ? undefined : anderen,
		// Weten we het station zeker, dan alleen als het vóór je uitstapstation is; anders liever wel waarschuwen
		voorUitstappen: iSplits < 0 || iNaar < 0 || (zeker ? iSplits < iNaar : iSplits <= iNaar)
	};
}

export async function treinInfo(key: string | undefined, ritnummer: string, v: TreinVraag): Promise<TreinInfo & { ruw?: unknown }> {
	const stations = await nsStations(key).catch(() => []);
	let stationCode = v.stationCode?.toUpperCase();
	if (!stationCode && (v.stationNaam || v.lat !== undefined)) {
		stationCode = stationVoorPlek(stations, {
			naam: v.stationNaam ?? '',
			lat: v.lat ?? 0,
			lon: v.lon ?? 0,
			type: 'station'
		})?.code;
	}
	const [samenstellingRes, ritRes] = await Promise.allSettled([
		nsSamenstelling(key, ritnummer, stationCode, v.datumTijd),
		nsRitRuw(key, ritnummer, v.datumTijd)
	]);
	const samenstelling = samenstellingRes.status === 'fulfilled' ? samenstellingRes.value : null;
	const ritRuw = ritRes.status === 'fulfilled' ? ritRes.value : null;
	const rit = ritRuw ? nsRitHaltes(ritRuw) : [];
	const halte =
		ritHalteBij(rit, { code: stationCode, naam: v.stationNaam, lat: v.lat, lon: v.lon }) ??
		rit.find((h) => h.materieel) ??
		rit[0];

	const bron: string[] = [];
	if (samenstelling) bron.push('NS Virtual Train API');
	if (rit.length) bron.push('NS Reisinformatie API');
	if (!bron.length) {
		const fout = samenstellingRes.status === 'rejected' ? samenstellingRes.reason : ritRes.status === 'rejected' ? ritRes.reason : null;
		throw fout ?? new Error('Geen treininformatie gevonden');
	}

	const materieel = halte?.materieel;
	const delen: TreinDeel[] =
		samenstelling?.delen ??
		(materieel?.delen ?? []).map((d) => ({ nummer: d.nummer, type: d.type, faciliteiten: d.faciliteiten.map((f) => f.toUpperCase()), bakken: 0, afbeelding: d.afbeelding }));

	let aantalBakken: number | undefined;
	let normaalBakken: number | undefined;
	if (materieel?.aantalDelen && materieel?.normaalDelen) {
		aantalBakken = materieel.aantalDelen;
		normaalBakken = materieel.normaalDelen;
	} else {
		aantalBakken = samenstelling?.lengteBakken ?? materieel?.aantalDelen;
	}
	const ingekort =
		!!samenstelling?.ingekort || (aantalBakken !== undefined && normaalBakken !== undefined && aantalBakken < normaalBakken);

	return {
		ritnummer,
		station: halte?.naam ?? samenstelling?.station,
		type: samenstelling?.type ?? materieel?.type,
		vervoerder: samenstelling?.vervoerder,
		spoor: samenstelling?.spoor ?? halte?.spoor,
		delen,
		aantalBakken,
		normaalBakken,
		ingekort,
		lengteMeter: samenstelling?.lengteMeter,
		drukte: halte?.drukte,
		faciliteiten: [...new Set(delen.flatMap((d) => d.faciliteiten))],
		instapadvies: samenstelling ? berekenInstapadvies(samenstelling) : undefined,
		zitplaatsen: samenstelling?.zitplaatsen ?? materieel?.zitplaatsen,
		splitsing: bepaalSplitsing(delen, rit, { stationNaam: halte?.naam ?? v.stationNaam, naar: v.naar, richting: v.richting, ritnummer }),
		bron,
		opgehaaldOp: new Date().toISOString(),
		// Alles wat NS gaf, zodat het echte formaat (bijvoorbeeld bij splitsen) te controleren is
		ruw: v.ruw ? { samenstelling: samenstelling?.ruw ?? null, rit: ritRuw?.payload ?? ritRuw, halte } : undefined
	};
}
