// Tijdhulpfuncties. Alle weergave gebeurt in Nederlandse tijd, ook als de server in UTC draait.

export const TIJDZONE = 'Europe/Amsterdam';

const uurMinuut = new Intl.DateTimeFormat('nl-NL', {
	timeZone: TIJDZONE,
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

const datumKort = new Intl.DateTimeFormat('nl-NL', {
	timeZone: TIJDZONE,
	weekday: 'short',
	day: 'numeric',
	month: 'short'
});

const datumLang = new Intl.DateTimeFormat('nl-NL', {
	timeZone: TIJDZONE,
	weekday: 'long',
	day: 'numeric',
	month: 'long'
});

export function ms(iso: string | undefined | null): number {
	if (!iso) return NaN;
	return Date.parse(iso);
}

/** "18:32" */
export function klok(iso: string | undefined | null): string {
	const t = ms(iso);
	if (Number.isNaN(t)) return '--:--';
	return uurMinuut.format(new Date(t));
}

/** "vr 25 sep" */
export function korteDatum(iso: string): string {
	return datumKort.format(new Date(ms(iso)));
}

/** "vrijdag 25 september" */
export function langeDatum(iso: string): string {
	return datumLang.format(new Date(ms(iso)));
}

/** Verschil in hele minuten (b - a), afgerond naar beneden bij positieve waarden */
export function minutenTussen(a: string, b: string): number {
	return Math.round((ms(b) - ms(a)) / 60000);
}

/** Vertraging in minuten tussen gepland en verwacht */
export function vertragingMinuten(t: { gepland: string; verwacht: string } | undefined): number {
	if (!t) return 0;
	return Math.round((ms(t.verwacht) - ms(t.gepland)) / 60000);
}

/** "1 u 5 min", "45 min" */
export function duurTekst(seconden: number): string {
	const min = Math.max(0, Math.round(seconden / 60));
	if (min < 60) return `${min} min`;
	const u = Math.floor(min / 60);
	const rest = min % 60;
	return rest === 0 ? `${u} u` : `${u} u ${rest} min`;
}

/** Onderdelen van een tijdstip in Nederlandse tijd */
export function nlOnderdelen(datum: Date): {
	jaar: number;
	maand: number;
	dag: number;
	uur: number;
	minuut: number;
	weekdag: number;
} {
	const delen = new Intl.DateTimeFormat('en-GB', {
		timeZone: TIJDZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		weekday: 'short',
		hour12: false
	}).formatToParts(datum);
	const get = (type: string) => delen.find((d) => d.type === type)?.value ?? '0';
	const weekdagen = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	return {
		jaar: Number(get('year')),
		maand: Number(get('month')),
		dag: Number(get('day')),
		uur: Number(get('hour')) % 24,
		minuut: Number(get('minute')),
		weekdag: weekdagen.indexOf(get('weekday')) + 1
	};
}

/** Tijdzoneverschil van Amsterdam t.o.v. UTC in minuten op een bepaald moment */
function offsetMinuten(datum: Date): number {
	const o = nlOnderdelen(datum);
	const alsUtc = Date.UTC(o.jaar, o.maand - 1, o.dag, o.uur, o.minuut);
	return Math.round((alsUtc - Math.floor(datum.getTime() / 60000) * 60000) / 60000);
}

/** Maakt een Date van een Nederlandse datum en tijd ("2026-09-25", "18:30") */
export function nlDatumTijd(datum: string, tijd: string): Date {
	const [j, m, d] = datum.split('-').map(Number);
	const [u, mi] = tijd.split(':').map(Number);
	const gok = new Date(Date.UTC(j, m - 1, d, u, mi));
	const offset = offsetMinuten(gok);
	const resultaat = new Date(gok.getTime() - offset * 60000);
	// Correctie rond de wissel van zomer- naar wintertijd
	const offset2 = offsetMinuten(resultaat);
	return offset2 === offset ? resultaat : new Date(gok.getTime() - offset2 * 60000);
}

/** "2026-09-25" in Nederlandse tijd */
export function nlDatum(datum: Date = new Date()): string {
	const o = nlOnderdelen(datum);
	return `${o.jaar}-${String(o.maand).padStart(2, '0')}-${String(o.dag).padStart(2, '0')}`;
}

/** "18:30" in Nederlandse tijd */
export function nlTijd(datum: Date = new Date()): string {
	const o = nlOnderdelen(datum);
	return `${String(o.uur).padStart(2, '0')}:${String(o.minuut).padStart(2, '0')}`;
}

/** Relatieve tijd: "nu", "over 5 min", "3 min geleden" */
export function relatief(iso: string, nu = Date.now()): string {
	const min = Math.round((ms(iso) - nu) / 60000);
	if (min === 0) return 'nu';
	if (min > 0) return min < 60 ? `over ${min} min` : `over ${duurTekst(min * 60)}`;
	return -min < 60 ? `${-min} min geleden` : `${duurTekst(-min * 60)} geleden`;
}

/** Aftelling mm:ss of u:mm:ss */
export function aftelling(doelMs: number, nu = Date.now()): string {
	let s = Math.max(0, Math.round((doelMs - nu) / 1000));
	const u = Math.floor(s / 3600);
	s -= u * 3600;
	const m = Math.floor(s / 60);
	s -= m * 60;
	const mm = String(m).padStart(u > 0 ? 2 : 1, '0');
	const ss = String(s).padStart(2, '0');
	return u > 0 ? `${u}:${mm}:${ss}` : `${mm}:${ss}`;
}
