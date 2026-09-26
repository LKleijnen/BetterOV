// Agenda-export (.ics) van een geplande reis, met vertrek, aankomst en overstappen.

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

export function maakIcs(advies: Advies, van: Plek, naar: Plek): string {
	const regels = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//BetterOV//Reis//NL',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${advies.id}-${icsDatum(advies.vertrek.gepland)}@betterov`,
		`DTSTAMP:${icsDatum(new Date().toISOString())}`,
		`DTSTART:${icsDatum(advies.vertrek.verwacht)}`,
		`DTEND:${icsDatum(advies.aankomst.verwacht)}`,
		`SUMMARY:${escape(`Reis naar ${naar.naam}`)}`,
		`LOCATION:${escape(van.naam)}`,
		`DESCRIPTION:${escape(reisOmschrijving(advies).join('\n'))}`,
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		`DESCRIPTION:${escape(`Vertrek naar ${naar.naam}`)}`,
		'TRIGGER:-PT15M',
		'END:VALARM',
		'END:VEVENT',
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
