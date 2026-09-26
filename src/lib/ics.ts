// Agenda-export (.ics) van een geplande reis: één afspraak per rit, met sporen en overstappen.

import type { Advies, Plek } from './types';
import { isOV, legNaam, overstappen } from './reis';
import { klok } from './tijd';

function icsDatum(iso: string): string {
	return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escape(t: string): string {
	return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Regels langer dan 75 octets vouwen volgens RFC 5545 */
function vouw(regel: string): string {
	const bytes = new TextEncoder().encode(regel);
	if (bytes.length <= 75) return regel;
	const delen: string[] = [];
	let huidig = '';
	let lengte = 0;
	for (const teken of regel) {
		const n = new TextEncoder().encode(teken).length;
		if (lengte + n > (delen.length === 0 ? 75 : 74)) {
			delen.push(huidig);
			huidig = '';
			lengte = 0;
		}
		huidig += teken;
		lengte += n;
	}
	delen.push(huidig);
	return delen.join('\r\n ');
}

export function reisOmschrijving(advies: Advies): string[] {
	const regels: string[] = [];
	const o = overstappen(advies);
	advies.legs.forEach((leg, i) => {
		if (isOV(leg)) {
			const spoorVan = leg.van.spoor ? `, spoor ${leg.van.spoor}` : '';
			const spoorNaar = leg.naar.spoor ? `, spoor ${leg.naar.spoor}` : '';
			regels.push(
				`${klok(leg.vertrek.verwacht)} ${legNaam(leg)} richting ${leg.richting ?? leg.naar.naam} vanaf ${leg.van.naam}${spoorVan}`
			);
			regels.push(`${klok(leg.aankomst.verwacht)} aankomst ${leg.naar.naam}${spoorNaar}`);
			const overstap = o.find((x) => x.vanLeg === i);
			if (overstap) regels.push(`Overstap ${overstap.overstaptijd} min in ${overstap.halte}`);
		} else if (leg.modus === 'lopen' && leg.duur >= 60) {
			regels.push(`${klok(leg.vertrek.verwacht)} ${Math.round(leg.duur / 60)} min lopen naar ${leg.naar.naam}`);
		}
	});
	return regels;
}

/** Minuten lopen/fietsen vóór de eerste rit, zodat de herinnering op tijd komt */
function voorloopMinuten(advies: Advies): number {
	const eerste = advies.legs.findIndex(isOV);
	if (eerste <= 0) return 0;
	return Math.round((Date.parse(advies.legs[eerste].vertrek.verwacht) - Date.parse(advies.vertrek.verwacht)) / 60000);
}

function herinnering(tekst: string, minutenVooraf: number): string[] {
	return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(tekst)}`, `TRIGGER:-PT${Math.max(0, minutenVooraf)}M`, 'END:VALARM'];
}

/**
 * Agenda-bestand met één afspraak per rit (trein, bus, tram, …), zodat je in je agenda ziet
 * in welke trein je zit en wanneer je moet uitstappen. Lopen staat in de beschrijving.
 */
export function maakIcs(advies: Advies, van: Plek, naar: Plek): string {
	const nu = icsDatum(new Date().toISOString());
	const ritten = advies.legs.map((leg, i) => ({ leg, i })).filter(({ leg }) => isOV(leg));
	const o = overstappen(advies);
	const afspraken: string[][] = [];

	if (ritten.length === 0) {
		// Alleen lopen of fietsen: één afspraak voor de hele reis
		afspraken.push([
			'BEGIN:VEVENT',
			`UID:${advies.id}-${icsDatum(advies.vertrek.gepland)}@betterov`,
			`DTSTAMP:${nu}`,
			`DTSTART:${icsDatum(advies.vertrek.verwacht)}`,
			`DTEND:${icsDatum(advies.aankomst.verwacht)}`,
			`SUMMARY:${escape(`Reis naar ${naar.naam}`)}`,
			`LOCATION:${escape(van.naam)}`,
			`DESCRIPTION:${escape(reisOmschrijving(advies).join('\n'))}`,
			...herinnering(`Vertrek naar ${naar.naam}`, 15),
			'END:VEVENT'
		]);
	}

	ritten.forEach(({ leg, i }, n) => {
		const spoorVan = leg.van.spoor ? `${leg.modus === 'trein' ? 'spoor' : 'perron'} ${leg.van.spoor}` : '';
		const spoorNaar = leg.naar.spoor ? `${leg.modus === 'trein' ? 'spoor' : 'perron'} ${leg.naar.spoor}` : '';
		const regels = [
			`Instappen ${klok(leg.vertrek.verwacht)}: ${leg.van.naam}${spoorVan ? `, ${spoorVan}` : ''}`,
			`Uitstappen ${klok(leg.aankomst.verwacht)}: ${leg.naar.naam}${spoorNaar ? `, ${spoorNaar}` : ''}`
		];
		if (leg.ritnummer) regels.push(`Rit ${leg.ritnummer}${leg.vervoerder ? ` (${leg.vervoerder})` : ''}`);
		const overstap = o.find((x) => x.vanLeg === i);
		if (overstap) {
			const volgende = advies.legs[overstap.naarLeg];
			regels.push(`Daarna overstappen (${overstap.overstaptijd} min): ${legNaam(volgende)} om ${klok(volgende.vertrek.verwacht)}`);
		}
		if (n === 0 && i > 0) {
			regels.push(`Vertrek ${klok(advies.vertrek.verwacht)} vanaf ${van.naam} (${voorloopMinuten(advies)} min lopen)`);
		}
		regels.push(`Reis naar ${naar.naam}${ritten.length > 1 ? `, rit ${n + 1} van ${ritten.length}` : ''}`);
		afspraken.push([
			'BEGIN:VEVENT',
			`UID:${advies.id}-${i}-${icsDatum(leg.vertrek.gepland)}@betterov`,
			`DTSTAMP:${nu}`,
			`DTSTART:${icsDatum(leg.vertrek.verwacht)}`,
			`DTEND:${icsDatum(leg.aankomst.verwacht)}`,
			`SUMMARY:${escape(`${legNaam(leg)} naar ${leg.richting ?? leg.naar.naam}${spoorVan ? ` (${spoorVan})` : ''}`)}`,
			`LOCATION:${escape(leg.van.naam)}`,
			`DESCRIPTION:${escape(regels.join('\n'))}`,
			...(n === 0 ? herinnering(`Vertrek naar ${naar.naam}`, 15 + voorloopMinuten(advies)) : []),
			'END:VEVENT'
		]);
	});

	const regels = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//BetterOV//Reis//NL',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		...afspraken.flat(),
		'END:VCALENDAR'
	];
	return regels.map(vouw).join('\r\n') + '\r\n';
}

export function downloadIcs(inhoud: string, bestandsnaam: string) {
	const blob = new Blob([inhoud], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = bestandsnaam;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}
