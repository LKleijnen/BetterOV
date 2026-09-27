// Toestand van de planner: invoer, resultaten (met eerder/later) en gekozen advies.

import type { Advies, PlanAntwoord, Plek, Voorkeur } from '$lib/types';
import { plekNaarParams } from '$lib/plekparams';
import { optiesNaarParams, STANDAARD_REISOPTIES, type Reisopties } from '$lib/reisopties';
import { korteDatum, nlDatum, nlDatumTijd, nlTijd } from '$lib/tijd';
import { api, metCache } from './api';
import { lees, schrijf } from './opslag';

interface Opgeslagen {
	van: Plek | null;
	naar: Plek | null;
	via: Plek | null;
	nu: boolean;
	datum: string;
	tijd: string;
	aankomst: boolean;
	voorkeur: Voorkeur;
}

function sessieLees<T>(k: string, standaard: T): T {
	try {
		const r = sessionStorage.getItem(k);
		return r ? (JSON.parse(r) as T) : standaard;
	} catch {
		return standaard;
	}
}

function sessieSchrijf(k: string, v: unknown) {
	try {
		sessionStorage.setItem(k, JSON.stringify(v));
	} catch {
		// negeren
	}
}

export const VOORKEUR_LABELS: Record<Voorkeur, string> = {
	snelst: 'Snelst',
	overstappen: 'Minste overstappen',
	goedkoopst: 'Goedkoopst',
	drukte: 'Minst druk'
};

class Planner {
	van = $state<Plek | null>(null);
	naar = $state<Plek | null>(null);
	via = $state<Plek | null>(null);
	nu = $state(true);
	datum = $state(nlDatum());
	tijd = $state(nlTijd());
	aankomst = $state(false);
	voorkeur = $state<Voorkeur>('snelst');
	/** Reisopties (per apparaat bewaard, zoals in de NS-app) */
	opties = $state<Reisopties>({ ...STANDAARD_REISOPTIES, ...lees<Partial<Reisopties>>('reisopties', {}) });

	adviezen = $state<Advies[]>([]);
	bron = $state<'transitous' | 'ns'>('transitous');
	melding = $state<string | null>(null);
	drukteBeschikbaar = $state(false);
	vorige = $state<string | undefined>(undefined);
	volgende = $state<string | undefined>(undefined);
	laden = $state<'nieuw' | 'eerder' | 'later' | null>(null);
	fout = $state<string | null>(null);
	opgehaaldOp = $state<string | null>(null);
	uitCache = $state(false);
	/** Van/naar zoals gebruikt bij de laatste zoekopdracht */
	gezocht = $state<{ van: Plek; naar: Plek } | null>(null);

	herstel() {
		const o = sessieLees<Opgeslagen | null>('planner', null);
		if (o) {
			this.van = o.van;
			this.naar = o.naar;
			this.via = o.via;
			this.nu = o.nu;
			this.datum = o.datum;
			this.tijd = o.tijd;
			this.aankomst = o.aankomst;
			this.voorkeur = o.voorkeur;
		}
		const r = sessieLees<{ adviezen: Advies[]; bron: 'transitous' | 'ns'; melding: string | null; vorige?: string; volgende?: string; opgehaaldOp: string | null; drukte: boolean; gezocht: { van: Plek; naar: Plek } | null } | null>('planner-resultaat', null);
		if (r) {
			this.adviezen = r.adviezen;
			this.bron = r.bron;
			this.melding = r.melding;
			this.vorige = r.vorige;
			this.volgende = r.volgende;
			this.opgehaaldOp = r.opgehaaldOp;
			this.drukteBeschikbaar = r.drukte;
			this.gezocht = r.gezocht;
		}
	}

	private bewaar() {
		sessieSchrijf('planner', {
			van: this.van,
			naar: this.naar,
			via: this.via,
			nu: this.nu,
			datum: this.datum,
			tijd: this.tijd,
			aankomst: this.aankomst,
			voorkeur: this.voorkeur
		} satisfies Opgeslagen);
		sessieSchrijf('planner-resultaat', {
			adviezen: this.adviezen,
			bron: this.bron,
			melding: this.melding,
			vorige: this.vorige,
			volgende: this.volgende,
			opgehaaldOp: this.opgehaaldOp,
			drukte: this.drukteBeschikbaar,
			gezocht: this.gezocht
		});
	}

	zetOpties(o: Reisopties) {
		this.opties = o;
		schrijf('reisopties', o);
	}

	wissel() {
		[this.van, this.naar] = [this.naar, this.van];
	}

	tijdstip(): string | undefined {
		if (this.nu) return undefined;
		return nlDatumTijd(this.datum, this.tijd).toISOString();
	}

	params(cursor?: string): string {
		const p = new URLSearchParams();
		plekNaarParams('van', this.van!, p);
		plekNaarParams('naar', this.naar!, p);
		plekNaarParams('via', this.via ?? undefined, p);
		const t = this.tijdstip();
		if (t) p.set('tijd', t);
		if (this.aankomst && !this.nu) p.set('aankomst', '1');
		p.set('voorkeur', this.voorkeur);
		optiesNaarParams(this.opties, p);
		if (cursor) {
			p.set('cursor', cursor);
			p.set('bron', this.bron);
		}
		return p.toString();
	}

	kan(): boolean {
		return !!this.van && !!this.naar;
	}

	async zoek() {
		if (!this.kan()) {
			this.fout = 'Kies waar je vandaan komt en waar je heen gaat.';
			return;
		}
		this.laden = 'nieuw';
		this.fout = null;
		const sleutel = `plan:${this.params()}`;
		try {
			const r = await metCache(sleutel, () => api<PlanAntwoord>(`/api/plan?${this.params()}`, { timeoutMs: 20000 }));
			this.adviezen = r.data.adviezen;
			this.bron = r.data.bron;
			this.melding = r.data.melding ?? null;
			this.vorige = r.data.vorige;
			this.volgende = r.data.volgende;
			this.drukteBeschikbaar = r.data.drukteBeschikbaar;
			this.opgehaaldOp = r.opgehaaldOp;
			this.uitCache = r.uitCache;
			if (r.uitCache) this.fout = `Geen verbinding: dit zijn opgeslagen resultaten. (${r.fout})`;
			this.gezocht = { van: this.van!, naar: this.naar! };
			this.onthoudRecent();
			for (const a of this.adviezen) onthoudAdvies(a, this.van!, this.naar!);
		} catch (e) {
			this.fout = (e as Error).message;
			this.adviezen = [];
		} finally {
			this.laden = null;
			this.bewaar();
		}
	}

	async meer(richting: 'eerder' | 'later') {
		const cursor = richting === 'eerder' ? this.vorige : this.volgende;
		if (!cursor || !this.kan()) return;
		this.laden = richting;
		try {
			const r = await api<PlanAntwoord>(`/api/plan?${this.params(cursor)}`, { timeoutMs: 20000 });
			const bekend = new Set(this.adviezen.map((a) => a.id));
			const nieuw = r.adviezen.filter((a) => !bekend.has(a.id));
			for (const a of nieuw) onthoudAdvies(a, this.van!, this.naar!);
			if (richting === 'eerder') {
				this.adviezen = [...nieuw, ...this.adviezen];
				this.vorige = r.vorige;
			} else {
				this.adviezen = [...this.adviezen, ...nieuw];
				this.volgende = r.volgende;
			}
			this.drukteBeschikbaar ||= r.drukteBeschikbaar;
		} catch (e) {
			this.fout = (e as Error).message;
		} finally {
			this.laden = null;
			this.bewaar();
		}
	}

	/** Voorkeur wisselen herberekent zonder opnieuw in te voeren (M4) */
	async kiesVoorkeur(v: Voorkeur) {
		this.voorkeur = v;
		if (this.gezocht) await this.zoek();
		else this.bewaar();
	}

	zetReis(van: Plek, naar: Plek, via?: Plek | null, voorkeur?: Voorkeur) {
		this.van = van;
		this.naar = naar;
		this.via = via ?? null;
		if (voorkeur) this.voorkeur = voorkeur;
		this.nu = true;
		this.aankomst = false;
	}

	zetMoment(datum: string, tijd: string, aankomst: boolean) {
		this.nu = false;
		this.datum = datum;
		this.tijd = tijd;
		this.aankomst = aankomst;
	}

	private onthoudRecent() {
		if (!this.van || !this.naar) return;
		// Recente zoekopdrachten voor het startscherm (GPS-locatie telt als "huidige locatie")
		const vorige = lees<RecenteZoekopdracht[]>('recente-zoekopdrachten', []);
		const deze: RecenteZoekopdracht = { van: this.van, naar: this.naar, via: this.via ?? undefined };
		const sleutel = (z: RecenteZoekopdracht) => `${z.van.type === 'gps' ? 'gps' : z.van.naam}|${z.naar.naam}|${z.via?.naam ?? ''}`;
		schrijf('recente-zoekopdrachten', [deze, ...vorige.filter((z) => sleutel(z) !== sleutel(deze))].slice(0, 6));
		const recent = lees<Plek[]>('recente-plekken', []);
		const nieuw = [this.naar, this.van, ...recent].filter(
			(p, i, lijst) => p.type !== 'gps' && lijst.findIndex((q) => q.naam === p.naam && q.lat === p.lat) === i
		);
		schrijf('recente-plekken', nieuw.slice(0, 8));
	}
}

export const planner = new Planner();

export interface RecenteZoekopdracht {
	van: Plek;
	naar: Plek;
	via?: Plek;
}

export function recenteZoekopdrachten(): RecenteZoekopdracht[] {
	return lees<RecenteZoekopdracht[]>('recente-zoekopdrachten', []);
}

/** Omschrijving van het gekozen moment, bijvoorbeeld "Nu" of "Aankomst za 3 okt 09:00" */
export function momentTekst(p: { nu: boolean; aankomst: boolean; datum: string; tijd: string }): string {
	if (p.nu) return 'Nu vertrekken';
	const dag = p.datum === nlDatum() ? 'vandaag' : korteDatum(nlDatumTijd(p.datum, '12:00').toISOString());
	return `${p.aankomst ? 'Aankomst' : 'Vertrek'} ${dag} ${p.tijd}`;
}

/** Adviezen per ID bewaren, zodat detail- en deelpagina's ze na herladen nog kennen */
export function onthoudAdvies(advies: Advies, van: Plek, naar: Plek) {
	sessieSchrijf(`advies:${advies.id}`, { advies, van, naar });
}

export function zoekAdvies(id: string): { advies: Advies; van: Plek; naar: Plek } | null {
	return sessieLees(`advies:${id}`, null);
}

export function recentePlekken(): Plek[] {
	return lees<Plek[]>('recente-plekken', []);
}
