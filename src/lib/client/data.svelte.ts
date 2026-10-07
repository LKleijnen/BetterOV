// Datalaag: Firestore (gesynchroniseerd tussen apparaten, met offline cache) of lokaal in demo-modus.

import {
	collection,
	deleteDoc,
	doc,
	getDocs,
	limit,
	onSnapshot,
	query,
	setDoc,
	Timestamp,
	updateDoc,
	where,
	writeBatch,
	type Unsubscribe
} from 'firebase/firestore';
import type {
	ActieveReisPointer,
	Advies,
	Favoriet,
	FavorietePlek,
	GedeeldeReis,
	Plek,
	Probleem,
	Profiel,
	Reis,
	WeekItem
} from '$lib/types';
import { firebaseActief } from './config';
import { fbDb } from './firebase';
import { lees, schrijf } from './opslag';
import { herinneringInstellingen } from '$lib/herinneringen';

export function nieuweId(lengte = 16): string {
	const bytes = new Uint8Array(lengte);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Verwijdert undefined-waarden (Firestore en JSON willen die niet) */
function schoon<T>(x: T): T {
	return JSON.parse(JSON.stringify(x)) as T;
}

class Data {
	profiel = $state<Profiel>({});
	favorieten = $state<Favoriet[]>([]);
	plekken = $state<FavorietePlek[]>([]);
	weekplanning = $state<WeekItem[]>([]);
	actieveReis = $state<Reis | null>(null);
	geladen = $state(false);
	/** true als de data uit de offline cache komt */
	offline = $state(false);

	private uid: string | null = null;
	private stoppers: Unsubscribe[] = [];

	get lokaal() {
		return !firebaseActief;
	}

	start(uid: string | null) {
		if (uid === this.uid) return;
		this.stop();
		this.uid = uid;
		if (!uid) return;
		if (this.lokaal) {
			this.profiel = lees('lokaal:profiel', {});
			this.favorieten = lees('lokaal:favorieten', []);
			this.plekken = lees('lokaal:plekken', []);
			this.weekplanning = lees('lokaal:weekplanning', []);
			const reizen = lees<Reis[]>('lokaal:reizen', []);
			this.actieveReis = reizen.find((r) => r.status === 'actief') ?? null;
			this.geladen = true;
			return;
		}
		const db = fbDb();
		const gebruiker = doc(db, 'users', uid);
		this.stoppers.push(
			onSnapshot(gebruiker, (s) => {
				this.profiel = (s.data() as Profiel) ?? {};
				this.offline = s.metadata.fromCache;
				this.geladen = true;
			}, () => (this.geladen = true)),
			onSnapshot(collection(gebruiker, 'favorieten'), (s) => {
				this.favorieten = s.docs.map((d) => ({ ...(d.data() as Favoriet), id: d.id }));
			}),
			onSnapshot(collection(gebruiker, 'plekken'), (s) => {
				this.plekken = s.docs.map((d) => ({ ...(d.data() as FavorietePlek), id: d.id }));
			}),
			onSnapshot(collection(gebruiker, 'weekplanning'), (s) => {
				this.weekplanning = s.docs.map((d) => ({ ...(d.data() as WeekItem), id: d.id }));
			}),
			onSnapshot(query(collection(gebruiker, 'reizen'), where('status', '==', 'actief'), limit(1)), (s) => {
				const d = s.docs[0];
				this.actieveReis = d ? ({ ...(d.data() as Reis), id: d.id } as Reis) : null;
			})
		);
	}

	stop() {
		for (const s of this.stoppers) s();
		this.stoppers = [];
		this.uid = null;
		this.geladen = false;
		this.profiel = {};
		this.favorieten = [];
		this.plekken = [];
		this.weekplanning = [];
		this.actieveReis = null;
	}

	private vereisUid(): string {
		if (!this.uid) throw new Error('Niet ingelogd');
		return this.uid;
	}

	// ---------- Profiel ----------

	async slaProfielOp(wijziging: Partial<Profiel>) {
		const uid = this.vereisUid();
		this.profiel = { ...this.profiel, ...wijziging };
		if (this.lokaal) return schrijf('lokaal:profiel', this.profiel);
		await setDoc(doc(fbDb(), 'users', uid), schoon(wijziging), { merge: true });
		// Loopt er een reis, dan gelden nieuwe herinneringen meteen (de cron-worker leest de kopie bij de reis)
		if (wijziging.herinneringen && this.actieveReis?.status === 'actief') {
			await setDoc(doc(fbDb(), 'actieveReizen', uid), { herinneringen: herinneringInstellingen(wijziging.herinneringen) }, { merge: true });
		}
	}

	// ---------- Lijsten ----------

	private async zetInLijst<T extends { id: string }>(naam: 'favorieten' | 'plekken' | 'weekplanning', item: T) {
		const uid = this.vereisUid();
		if (this.lokaal) {
			const lijst = (this[naam] as unknown as T[]).filter((x) => x.id !== item.id);
			lijst.push(item);
			(this[naam] as unknown as T[]) = lijst;
			return schrijf(`lokaal:${naam}`, lijst);
		}
		const { id, ...rest } = item;
		await setDoc(doc(fbDb(), 'users', uid, naam, id), schoon(rest));
	}

	private async verwijderUitLijst(naam: 'favorieten' | 'plekken' | 'weekplanning', id: string) {
		const uid = this.vereisUid();
		if (this.lokaal) {
			const lijst = (this[naam] as { id: string }[]).filter((x) => x.id !== id);
			(this[naam] as { id: string }[]) = lijst;
			return schrijf(`lokaal:${naam}`, lijst);
		}
		await deleteDoc(doc(fbDb(), 'users', uid, naam, id));
	}

	zetFavoriet(f: Omit<Favoriet, 'id'> & { id?: string }) {
		return this.zetInLijst('favorieten', { ...f, id: f.id ?? nieuweId(10) } as Favoriet);
	}
	verwijderFavoriet(id: string) {
		return this.verwijderUitLijst('favorieten', id);
	}
	zetPlek(p: Omit<FavorietePlek, 'id'> & { id?: string }) {
		return this.zetInLijst('plekken', { ...p, id: p.id ?? nieuweId(10) } as FavorietePlek);
	}
	verwijderPlek(id: string) {
		return this.verwijderUitLijst('plekken', id);
	}
	zetWeekItem(w: Omit<WeekItem, 'id'> & { id?: string }) {
		return this.zetInLijst('weekplanning', { ...w, id: w.id ?? nieuweId(10) } as WeekItem);
	}
	verwijderWeekItem(id: string) {
		return this.verwijderUitLijst('weekplanning', id);
	}

	isFavoriet(van: Plek, naar: Plek): Favoriet | undefined {
		const zelfde = (a: Plek, b: Plek) => a.naam === b.naam && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
		return this.favorieten.find((f) => zelfde(f.van, van) && zelfde(f.naar, naar));
	}

	// ---------- Reizen ----------

	private lokaleReizen(): Reis[] {
		return lees<Reis[]>('lokaal:reizen', []);
	}

	private bewaarLokaleReis(reis: Reis) {
		const lijst = this.lokaleReizen().filter((r) => r.id !== reis.id);
		lijst.unshift(reis);
		schrijf('lokaal:reizen', lijst.slice(0, 100));
		this.actieveReis = lijst.find((r) => r.status === 'actief') ?? null;
	}

	async startReis(van: Plek, naar: Plek, advies: Advies): Promise<Reis> {
		const uid = this.vereisUid();
		if (this.actieveReis) await this.beeindigReis(this.actieveReis);
		const nu = new Date().toISOString();
		const reis: Reis = schoon({
			id: nieuweId(12),
			status: 'actief',
			van,
			naar,
			advies,
			aangemaaktOp: nu,
			gestartOp: nu,
			laatstBijgewerkt: nu
		});
		if (this.lokaal) {
			this.bewaarLokaleReis(reis);
			return reis;
		}
		const db = fbDb();
		const { id, ...rest } = reis;
		const pointer: ActieveReisPointer = {
			uid,
			reisId: id,
			van,
			naar,
			advies,
			gemeld: [],
			eindeOp: advies.aankomst.verwacht,
			herinneringen: herinneringInstellingen(this.profiel.herinneringen)
		};
		const batch = writeBatch(db);
		batch.set(doc(db, 'users', uid, 'reizen', id), rest);
		batch.set(doc(db, 'actieveReizen', uid), schoon(pointer));
		this.actieveReis = reis;
		await batch.commit();
		return reis;
	}

	async werkReisBij(reis: Reis, advies: Advies, problemen: Probleem[]) {
		const uid = this.vereisUid();
		const nu = new Date().toISOString();
		const bijgewerkt: Reis = schoon({ ...reis, advies, problemen, laatstBijgewerkt: nu });
		if (this.lokaal) return this.bewaarLokaleReis(bijgewerkt);
		const db = fbDb();
		this.actieveReis = bijgewerkt;
		const batch = writeBatch(db);
		batch.update(doc(db, 'users', uid, 'reizen', reis.id), schoon({ advies, problemen, laatstBijgewerkt: nu }));
		if (reis.status === 'actief') {
			batch.set(
				doc(db, 'actieveReizen', uid),
				schoon({ uid, reisId: reis.id, van: reis.van, naar: reis.naar, advies, eindeOp: advies.aankomst.verwacht }),
				{ merge: true }
			);
		}
		await batch.commit();
		if (reis.gedeeldId) await this.werkDelenBij(reis.gedeeldId, bijgewerkt).catch(() => {});
	}

	async beeindigReis(reis: Reis) {
		const uid = this.vereisUid();
		const nu = new Date().toISOString();
		if (this.lokaal) return this.bewaarLokaleReis({ ...reis, status: 'afgerond', afgerondOp: nu });
		const db = fbDb();
		this.actieveReis = null;
		const batch = writeBatch(db);
		batch.update(doc(db, 'users', uid, 'reizen', reis.id), { status: 'afgerond', afgerondOp: nu });
		batch.delete(doc(db, 'actieveReizen', uid));
		await batch.commit();
		if (reis.gedeeldId) {
			await updateDoc(doc(db, 'gedeeldeReizen', reis.gedeeldId), { 'reis.status': 'afgerond', 'reis.bijgewerktOp': nu }).catch(() => {});
		}
	}

	async geschiedenis(): Promise<Reis[]> {
		const uid = this.vereisUid();
		let lijst: Reis[];
		if (this.lokaal) {
			lijst = this.lokaleReizen().filter((r) => r.status === 'afgerond');
		} else {
			const s = await getDocs(query(collection(fbDb(), 'users', uid, 'reizen'), where('status', '==', 'afgerond'), limit(200)));
			lijst = s.docs.map((d) => ({ ...(d.data() as Reis), id: d.id }));
		}
		return lijst.sort((a, b) => (b.gestartOp ?? b.aangemaaktOp).localeCompare(a.gestartOp ?? a.aangemaaktOp));
	}

	async verwijderReis(id: string) {
		const uid = this.vereisUid();
		if (this.lokaal) return schrijf('lokaal:reizen', this.lokaleReizen().filter((r) => r.id !== id));
		await deleteDoc(doc(fbDb(), 'users', uid, 'reizen', id));
	}

	// ---------- Push ----------

	async registreerPushToken(token: string) {
		const uid = this.vereisUid();
		if (this.lokaal) return;
		await setDoc(doc(fbDb(), 'users', uid, 'pushTokens', token), { aangemaaktOp: new Date().toISOString() });
	}

	// ---------- Delen ----------

	async deelReis(reis: Reis): Promise<string> {
		const uid = this.vereisUid();
		if (this.lokaal) throw new Error('Delen werkt pas als Firebase is ingesteld.');
		if (reis.gedeeldId) return reis.gedeeldId;
		const db = fbDb();
		const shareId = nieuweId(18);
		const verloopt = new Date(Date.parse(reis.advies.aankomst.verwacht) + 2 * 3600 * 1000);
		await setDoc(doc(db, 'gedeeldeReizen', shareId), {
			uid,
			reisId: reis.id,
			naam: this.profiel.naam ?? null,
			reis: schoon({
				van: reis.van,
				naar: reis.naar,
				advies: reis.advies,
				status: reis.status,
				problemen: reis.problemen ?? [],
				bijgewerktOp: new Date().toISOString()
			}),
			verlooptOp: Timestamp.fromDate(verloopt)
		});
		const batch = writeBatch(db);
		batch.update(doc(db, 'users', uid, 'reizen', reis.id), { gedeeldId: shareId });
		if (reis.status === 'actief') batch.set(doc(db, 'actieveReizen', uid), { gedeeldId: shareId }, { merge: true });
		await batch.commit();
		if (this.actieveReis?.id === reis.id) this.actieveReis = { ...this.actieveReis, gedeeldId: shareId };
		return shareId;
	}

	async werkDelenBij(shareId: string, reis: Reis, locatie?: { lat: number; lng: number }) {
		if (this.lokaal) return;
		const db = fbDb();
		const wijziging: Record<string, unknown> = {
			reis: schoon({
				van: reis.van,
				naar: reis.naar,
				advies: reis.advies,
				status: reis.status,
				problemen: reis.problemen ?? [],
				bijgewerktOp: new Date().toISOString()
			}),
			verlooptOp: Timestamp.fromDate(new Date(Date.parse(reis.advies.aankomst.verwacht) + 2 * 3600 * 1000))
		};
		if (locatie) wijziging.laatsteLocatie = { ...locatie, tijd: new Date().toISOString() };
		await updateDoc(doc(db, 'gedeeldeReizen', shareId), wijziging);
	}

	async deelLocatie(shareId: string, lat: number, lng: number) {
		if (this.lokaal) return;
		await updateDoc(doc(fbDb(), 'gedeeldeReizen', shareId), { laatsteLocatie: { lat, lng, tijd: new Date().toISOString() } });
	}

	async stopDelen(reis: Reis) {
		const uid = this.vereisUid();
		if (this.lokaal || !reis.gedeeldId) return;
		const db = fbDb();
		await deleteDoc(doc(db, 'gedeeldeReizen', reis.gedeeldId)).catch(() => {});
		const batch = writeBatch(db);
		batch.update(doc(db, 'users', uid, 'reizen', reis.id), { gedeeldId: null });
		if (reis.status === 'actief') batch.set(doc(db, 'actieveReizen', uid), { gedeeldId: null }, { merge: true });
		await batch.commit();
		if (this.actieveReis?.id === reis.id) this.actieveReis = { ...this.actieveReis, gedeeldId: undefined };
	}
}

export const data = new Data();

/** Luistert zonder login naar een gedeelde reis (realtime, zonder pollen) */
export function luisterNaarGedeeldeReis(
	shareId: string,
	cb: (r: GedeeldeReis | null, fout?: string) => void
): () => void {
	if (!firebaseActief) {
		cb(null, 'Delen werkt pas als Firebase is ingesteld.');
		return () => {};
	}
	return onSnapshot(
		doc(fbDb(), 'gedeeldeReizen', shareId),
		(s) => {
			if (!s.exists()) return cb(null, 'Deze gedeelde reis bestaat niet (meer).');
			const d = s.data();
			const verloopt = d.verlooptOp instanceof Timestamp ? d.verlooptOp.toDate().toISOString() : String(d.verlooptOp);
			cb({ ...(d as GedeeldeReis), verlooptOp: verloopt });
		},
		() => cb(null, 'Deze gedeelde reis is verlopen of bestaat niet.')
	);
}
