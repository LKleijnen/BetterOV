// Antwoorden voor de AI-assistent in gewoon Nederlands. De assistent krijgt dezelfde gegevens
// ook als JSON, maar leest meestal deze tekst voor, dus die moet kloppen en kort zijn.

import type {
	Advies,
	Halte,
	Leg,
	PlanAntwoord,
	Plek,
	Probleem,
	Reis,
	StationInfo,
	TreinInfo,
	Vertrek,
	VertrekAntwoord,
	Voorziening
} from '../../types';
import { huidigeStap, isOV, legNaam, overstappen, probleemTitel } from '../../reis';
import { splitsTekst } from '../../splitsen';
import { materieelSoort } from '../../materieel';
import { treinVariant } from '../../treinvariant';
import { duurTekst, klok, korteDatum, minutenTussen, vertragingMinuten } from '../../tijd';

export function euro(centen: number): string {
	return `€ ${(centen / 100).toFixed(2).replace('.', ',')}`;
}

/** "14:05 (+3)" */
export function tijdTekst(t: { gepland: string; verwacht: string } | undefined): string {
	if (!t) return '--:--';
	const vertraging = vertragingMinuten(t);
	return vertraging > 0 ? `${klok(t.verwacht)} (+${vertraging}, gepland ${klok(t.gepland)})` : klok(t.verwacht);
}

export function plekTekst(p: Plek): string {
	const extra = [p.omschrijving, p.type && p.type !== 'plek' ? p.type : undefined].filter(Boolean).join(', ');
	return extra ? `${p.naam} (${extra})` : p.naam;
}

function spoorTekst(h: Halte): string {
	if (!h.spoor && !h.geplandSpoor) return '';
	const gewijzigd = h.geplandSpoor && h.spoor && h.geplandSpoor !== h.spoor;
	return gewijzigd ? `, spoor ${h.spoor} (gewijzigd, was ${h.geplandSpoor})` : `, spoor ${h.spoor ?? h.geplandSpoor}`;
}

const DRUKTE_TEKST = { laag: 'rustig', gemiddeld: 'gemiddeld druk', hoog: 'druk', onbekend: '' } as const;

export function legTekst(leg: Leg): string {
	if (!isOV(leg)) {
		const min = Math.max(1, Math.round(leg.duur / 60));
		return `${legNaam(leg)} ${min} min van ${leg.van.naam} naar ${leg.naar.naam}`;
	}
	const delen = [
		`${tijdTekst(leg.vertrek)} ${leg.van.naam}${spoorTekst(leg.van)}`,
		`${legNaam(leg)}${leg.richting ? ` richting ${leg.richting}` : ''}`,
		`aankomst ${tijdTekst(leg.aankomst)} ${leg.naar.naam}${spoorTekst(leg.naar)}`
	];
	const extra: string[] = [];
	if (leg.ritnummer) extra.push(`ritnummer ${leg.ritnummer}`);
	if (leg.vervoerder && !leg.isNS) extra.push(leg.vervoerder);
	if (leg.drukte && leg.drukte !== 'onbekend') extra.push(DRUKTE_TEKST[leg.drukte]);
	if (leg.uitgevallen) extra.push('RIJDT NIET');
	const regel = `${delen.join(' → ')}${extra.length ? ` [${extra.join(', ')}]` : ''}`;
	const meldingen = leg.meldingen.map((m) => `\n    ! ${m.kop}${m.tekst ? `: ${m.tekst}` : ''}`).join('');
	return regel + meldingen;
}

export function adviesTekst(a: Advies, nummer?: number): string {
	const kop = [
		`${nummer ? `${nummer}. ` : ''}${klok(a.vertrek.verwacht)} → ${klok(a.aankomst.verwacht)}`,
		duurTekst(a.duur),
		a.overstappen === 0 ? 'geen overstap' : `${a.overstappen} overstap${a.overstappen > 1 ? 'pen' : ''}`
	];
	if (a.prijs) kop.push(`${euro(a.prijs.bedrag)}${a.prijs.exact ? '' : ' (schatting)'}`);
	if (a.drukte && a.drukte !== 'onbekend') kop.push(DRUKTE_TEKST[a.drukte]);
	const vertraging = vertragingMinuten(a.vertrek);
	if (vertraging > 0) kop.push(`${vertraging} min vertraging`);
	const regels = a.legs.map((l) => `   - ${legTekst(l)}`);
	const krap = overstappen(a)
		.filter((o) => o.krap)
		.map((o) => `   ! Krappe overstap in ${o.halte} (${o.marge} min over)`);
	const meldingen = (a.meldingen ?? []).map((m) => `   ! ${m.kop}${m.tekst ? `: ${m.tekst}` : ''}`);
	return [`${kop.join(' · ')} [id ${a.id}]`, ...regels, ...krap, ...meldingen].join('\n');
}

export function adviezenTekst(antwoord: PlanAntwoord, van: Plek, naar: Plek): string {
	if (!antwoord.adviezen.length) {
		return `Geen reis gevonden van ${plekTekst(van)} naar ${plekTekst(naar)}.${antwoord.melding ? ` ${antwoord.melding}` : ''}`;
	}
	const datum = korteDatum(antwoord.adviezen[0].vertrek.verwacht);
	const kop = `Reisadviezen ${plekTekst(van)} → ${plekTekst(naar)} (${datum}, bron ${antwoord.bron === 'ns' ? 'NS' : 'Transitous'}):`;
	const staart = [
		antwoord.melding ? `Let op: ${antwoord.melding}` : '',
		'Tijden zijn Nederlandse tijd; (+n) is de vertraging in minuten.'
	].filter(Boolean);
	return [kop, ...antwoord.adviezen.map((a, i) => adviesTekst(a, i + 1)), ...staart].join('\n');
}

export function vertrekTekst(v: Vertrek): string {
	const delen = [
		tijdTekst(v.tijd),
		`${v.lijn || legNaam({ modus: v.modus, lijn: v.lijn, productNaam: v.productNaam } as Leg)} naar ${v.richting}`
	];
	if (v.spoor || v.geplandSpoor) {
		const gewijzigd = v.geplandSpoor && v.spoor && v.geplandSpoor !== v.spoor;
		delen.push(gewijzigd ? `spoor ${v.spoor} (gewijzigd)` : `spoor ${v.spoor ?? v.geplandSpoor}`);
	}
	if (v.via?.length) delen.push(`via ${v.via.join(', ')}`);
	if (v.ritnummer) delen.push(`ritnummer ${v.ritnummer}`);
	if (v.uitgevallen) delen.push('RIJDT NIET');
	const meldingen = v.meldingen.map((m) => `\n    ! ${m.kop}${m.tekst ? `: ${m.tekst}` : ''}`).join('');
	return `- ${delen.join(' · ')}${meldingen}`;
}

export function vertrekkenTekst(a: VertrekAntwoord): string {
	const kop = `Vertrektijden ${a.halte.naam} (bron ${a.bron === 'ns' ? 'NS' : 'Transitous'}, opgehaald ${klok(a.opgehaaldOp)}):`;
	if (!a.vertrekken.length) return `${kop}\nGeen vertrekken gevonden.`;
	return [kop, ...a.vertrekken.map(vertrekTekst), a.melding ? `Let op: ${a.melding}` : ''].filter(Boolean).join('\n');
}

export function treinTekst(t: TreinInfo): string {
	const regels: string[] = [];
	const type = materieelSoort(t.type);
	regels.push(
		`Trein ${t.ritnummer}${t.station ? ` op ${t.station}` : ''}${t.spoor ? `, spoor ${t.spoor}` : ''}: ${
			type?.naam ?? t.type ?? 'type onbekend'
		}${t.aantalBakken ? `, ${t.aantalBakken} bakken` : ''}${t.lengteMeter ? `, ${t.lengteMeter} m` : ''}`
	);
	if (t.ingekort && t.normaalBakken) regels.push(`! Kortere trein dan normaal: ${t.aantalBakken} in plaats van ${t.normaalBakken} bakken.`);
	if (t.drukte && t.drukte !== 'onbekend') regels.push(`Drukte: ${DRUKTE_TEKST[t.drukte]}.`);
	if (t.zitplaatsen) regels.push(`Ongeveer ${t.zitplaatsen} zitplaatsen.`);
	for (const [i, deel] of t.delen.entries()) {
		const variant = treinVariant(deel.type, deel.nummer, t.vervoerder);
		const details = [
			deel.type,
			variant ? `versie ${variant.naam}` : '',
			deel.nummer ? `treinstel ${deel.nummer}` : '',
			`${deel.bakken} bakken`,
			deel.eindbestemming ? `naar ${deel.eindbestemming}` : '',
			deel.drukte && deel.drukte !== 'onbekend' ? DRUKTE_TEKST[deel.drukte] : '',
			deel.faciliteiten.join(', ')
		].filter(Boolean);
		regels.push(`Deel ${i + 1}: ${details.join(' · ')}`);
	}
	if (t.instapadvies?.samenvatting.length) {
		regels.push(`Instappen: ${t.instapadvies.samenvatting.join('; ')}${t.instapadvies.nauwkeurig ? '' : ' (benadering)'}`);
	}
	const splits = splitsTekst(t);
	if (splits) regels.push(`! ${splits.kop}. ${splits.jouw} ${splits.anders}`.trim());
	if (t.faciliteiten.length) regels.push(`Voorzieningen: ${t.faciliteiten.join(', ')}.`);
	if (type) regels.push(`Over dit type: ${type.omschrijving}`);
	regels.push(`Bron: ${t.bron.join(', ')} (${klok(t.opgehaaldOp)}).`);
	return regels.join('\n');
}

function voorzieningTekst(v: Voorziening): string {
	const extra = [v.open === undefined ? '' : v.open ? 'nu open' : 'nu gesloten', v.ovFietsen !== undefined ? `${v.ovFietsen} OV-fietsen` : '']
		.filter(Boolean)
		.join(', ');
	return `- ${v.naam}${v.soortNaam ? ` (${v.soortNaam})` : ''}${extra ? ` — ${extra}` : ''}`;
}

export function stationTekst(s: StationInfo): string {
	const regels = [
		`${s.naam} (${s.code})${s.type ? `, ${s.type.toLowerCase().replace(/_/g, ' ')}` : ''}`,
		s.sporen.length ? `Sporen: ${s.sporen.join(', ')}.` : '',
		s.reisassistentie === undefined ? '' : `Reisassistentie: ${s.reisassistentie ? 'ja' : 'nee'}.`
	].filter(Boolean);
	if (s.voorzieningen.length) {
		regels.push('Voorzieningen op en bij het station:');
		regels.push(...s.voorzieningen.slice(0, 40).map(voorzieningTekst));
	} else {
		regels.push('Geen voorzieningen bekend bij dit station.');
	}
	regels.push(`Bron: ${s.bron.join(', ')}.`);
	return regels.join('\n');
}

/** De lopende of geplande reis, met waar je nu bent en wat er misgaat */
export function reisTekst(reis: Reis, problemen: Probleem[], nu = Date.now()): string {
	const stap = huidigeStap(reis.advies, nu);
	const regels = [
		`Reis ${plekTekst(reis.van)} → ${plekTekst(reis.naar)} (${reis.status}, gestart ${reis.gestartOp ? klok(reis.gestartOp) : '-'}).`,
		`Nu: ${stap.titel} — ${stap.detail}.`
	];
	if (stap.fase !== 'klaar') {
		const min = minutenTussen(new Date(nu).toISOString(), stap.doel);
		regels.push(min >= 0 ? `Dat is over ${min} min.` : `Dat was ${-min} min geleden.`);
	}
	regels.push(adviesTekst(reis.advies));
	if (problemen.length) {
		regels.push('Problemen:');
		regels.push(...problemen.map((p) => `! ${probleemTitel(p)}: ${p.tekst}`));
	} else {
		regels.push('Geen problemen gevonden met deze reis.');
	}
	return regels.join('\n');
}
