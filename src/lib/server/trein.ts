// Treininformatie voor één NS-rit: samenstelling, drukte, lengte t.o.v. normaal en instapadvies.

import type { Instapadvies, TreinDeel, TreinInfo } from '../types';
import { nsRit, nsSamenstelling, nsStations, ritHalteBij, stationVoorPlek, type NsSamenstelling } from './ns';

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
	const nauwkeurig = ek.length > 0 || st.length > 0;
	const samenvatting: string[] = [];
	const plek = s.rijrichting ? '' : ' (zoals getekend)';
	const perDeel = (delen: number[]) => [...new Set(delen.map((i) => deelPositie(i, s.delen.length, s.rijrichting)))].join(' en ');
	if (ek.length) samenvatting.push(`Eerste klas: ${beschrijf(ek, s.rijrichting)}${plek}`);
	else if (perDeelEerste.length) samenvatting.push(`Eerste klas: ${perDeel(perDeelEerste)}`);
	if (st.length) samenvatting.push(`Stiltecoupé: ${beschrijf(st, s.rijrichting)}${plek}`);
	else if (perDeelStilte.length) samenvatting.push(`Stiltecoupé: ${perDeel(perDeelStilte)}`);
	if (!samenvatting.length) samenvatting.push('De NS-data bevat voor deze trein geen indeling.');
	return { eersteKlas: ek, stilte: st, rijrichting: s.rijrichting, samenvatting, nauwkeurig };
}

export interface TreinVraag {
	stationCode?: string;
	stationNaam?: string;
	lat?: number;
	lon?: number;
	datumTijd?: string;
	/** Ruwe NS-data meesturen (voor controle en debuggen) */
	ruw?: boolean;
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
		nsRit(key, ritnummer, v.datumTijd)
	]);
	const samenstelling = samenstellingRes.status === 'fulfilled' ? samenstellingRes.value : null;
	const rit = ritRes.status === 'fulfilled' ? ritRes.value : [];
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
		(materieel?.delen ?? []).map((d) => ({ type: d.type, faciliteiten: d.faciliteiten.map((f) => f.toUpperCase()), bakken: 0, afbeelding: d.afbeelding }));

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
		bron,
		opgehaaldOp: new Date().toISOString(),
		ruw: v.ruw ? { samenstelling: samenstelling?.ruw, halte } : undefined
	};
}
