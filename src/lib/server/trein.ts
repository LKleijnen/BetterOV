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

export function berekenInstapadvies(s: NsSamenstelling): Instapadvies | undefined {
	const totaal = s.delen.reduce((t, d) => t + Math.max(1, d.bakken), 0);
	if (!totaal) return undefined;
	const eersteKlas: Bereik[] = [];
	const stilte: Bereik[] = [];
	const nauwkeurig = s.delen.some((d) => d.indeling && d.indeling.length === Math.max(1, d.bakken));
	let positie = 0;
	s.delen.forEach((d, i) => {
		const n = Math.max(1, d.bakken);
		if (d.indeling && d.indeling.length === n) {
			d.indeling.forEach((b, j) => {
				const r = { van: (positie + j) / totaal, tot: (positie + j + 1) / totaal };
				if (b.eersteKlas) eersteKlas.push(r);
				if (b.stilte) stilte.push(r);
			});
		} else {
			const r = { van: positie / totaal, tot: (positie + n) / totaal };
			if (d.faciliteiten.some((f) => f.includes('STILTE'))) stilte.push(r);
			if (s.eersteKlasPerDeel[i]) eersteKlas.push(r);
		}
		positie += n;
	});
	const ek = samenvoegen(eersteKlas);
	const st = samenvoegen(stilte);
	const samenvatting: string[] = [];
	const plek = s.rijrichting ? '' : ' (zoals getekend)';
	if (ek.length) samenvatting.push(`Eerste klas: ${beschrijf(ek, s.rijrichting)}${plek}`);
	if (st.length) samenvatting.push(`Stiltecoupé: ${beschrijf(st, s.rijrichting)}${plek}`);
	if (!ek.length && !st.length) samenvatting.push('De NS-data bevat voor deze trein geen indeling per bak.');
	else if (!nauwkeurig) samenvatting.push('Positie per treinstel; de precieze bak staat op de trein aangegeven.');
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
