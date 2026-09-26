// Beheer van de actieve reis terwijl de app open is: verversen bij openen en elke 30 s,
// lokale meldingen bij nieuwe problemen, locatie delen en automatisch afronden.

import type { Advies, Probleem } from '$lib/types';
import { probleemTitel } from '$lib/reis';
import { api, metCache } from './api';
import { data } from './data.svelte';
import { volgPositie } from './gps';
import { lokaleMelding } from './push';
import { lees, schrijf } from './opslag';

export const VERVERS_INTERVAL_MS = 30000;
/** Hooguit één locatie-update per minuut naar Firestore (gratis limiet) */
const LOCATIE_INTERVAL_MS = 60000;

interface StatusAntwoord {
	advies: Advies;
	gewijzigd: boolean;
	problemen: Probleem[];
	opgehaaldOp: string;
}

class Actief {
	bezig = $state(false);
	fout = $state<string | null>(null);
	opgehaaldOp = $state<string | null>(null);
	uitCache = $state(false);
	private timer: ReturnType<typeof setInterval> | undefined;
	private stopLocatie: (() => void) | undefined;
	private laatsteLocatie = 0;
	private gedeeldId: string | undefined;

	get reis() {
		return data.actieveReis;
	}

	start() {
		if (this.timer) return;
		this.timer = setInterval(() => {
			if (document.visibilityState === 'visible') void this.ververs();
		}, VERVERS_INTERVAL_MS);
		document.addEventListener('visibilitychange', this.opZichtbaar);
		void this.ververs();
	}

	stop() {
		clearInterval(this.timer);
		this.timer = undefined;
		document.removeEventListener('visibilitychange', this.opZichtbaar);
		this.stopLocatie?.();
		this.stopLocatie = undefined;
	}

	private opZichtbaar = () => {
		if (document.visibilityState === 'visible') void this.ververs();
	};

	/** Start of stopt het delen van de locatie, afhankelijk van of de reis gedeeld is */
	synchroniseerLocatieDelen() {
		const id = this.reis?.gedeeldId;
		if (id === this.gedeeldId) return;
		this.gedeeldId = id;
		this.stopLocatie?.();
		this.stopLocatie = undefined;
		if (!id) return;
		this.stopLocatie = volgPositie((p) => {
			const nu = Date.now();
			if (nu - this.laatsteLocatie < LOCATIE_INTERVAL_MS) return;
			this.laatsteLocatie = nu;
			void data.deelLocatie(id, p.lat, p.lon).catch(() => {});
		});
	}

	async ververs() {
		const reis = data.actieveReis;
		if (!reis || this.bezig) return;
		this.bezig = true;
		try {
			const r = await metCache(`reis:${reis.id}`, () =>
				api<StatusAntwoord>('/api/reisstatus', { body: { advies: reis.advies }, timeoutMs: 15000 })
			);
			this.opgehaaldOp = r.opgehaaldOp;
			this.uitCache = r.uitCache;
			this.fout = r.fout ?? null;
			if (!r.uitCache) {
				const problemenGewijzigd = JSON.stringify(r.data.problemen) !== JSON.stringify(reis.problemen ?? []);
				if (r.data.gewijzigd || problemenGewijzigd) {
					await data.werkReisBij(reis, r.data.advies, r.data.problemen);
				}
				await this.meldNieuweProblemen(reis.id, r.data.problemen);
			}
			// Automatisch afronden 20 minuten na aankomst
			const aankomst = Date.parse((this.reis ?? reis).advies.aankomst.verwacht);
			if (Date.now() > aankomst + 20 * 60000 && data.actieveReis?.id === reis.id) {
				await data.beeindigReis(data.actieveReis);
			}
		} catch (e) {
			this.fout = (e as Error).message;
		} finally {
			this.bezig = false;
		}
	}

	private async meldNieuweProblemen(reisId: string, problemen: Probleem[]) {
		const sleutel = `gemeld:${reisId}`;
		const gemeld = new Set(lees<string[]>(sleutel, []));
		const nieuw = problemen.filter((p) => !gemeld.has(p.sleutel));
		if (nieuw.length === 0) return;
		for (const p of nieuw) gemeld.add(p.sleutel);
		schrijf(sleutel, [...gemeld]);
		// Alleen een systeemmelding als de app niet in beeld is; in beeld toont het scherm het probleem
		if (document.visibilityState !== 'visible') {
			const eerste = nieuw.find((p) => p.ernstig) ?? nieuw[0];
			await lokaleMelding(probleemTitel(eerste), eerste.tekst);
		}
	}
}

export const actief = new Actief();
