// Loginstatus: Google-login via Firebase, allowlist-controle via /api/ik. Zonder Firebase: demo-modus.

import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { api, zetTokenBron } from './api';
import { firebaseActief } from './config';
import { fbAuth } from './firebase';
import { lees, schrijf } from './opslag';

export type SessieStatus = 'laden' | 'uitgelogd' | 'geweigerd' | 'ingelogd';

interface IkAntwoord {
	email?: string;
	toegestaan: boolean;
	admin: boolean;
	demo: boolean;
	nsIngesteld: boolean;
	pushIngesteld: boolean;
	mock: boolean;
}

class Sessie {
	status = $state<SessieStatus>('laden');
	uid = $state<string | null>(null);
	email = $state<string | null>(null);
	naam = $state<string | null>(null);
	foto = $state<string | null>(null);
	admin = $state(false);
	demo = $state(!firebaseActief);
	nsIngesteld = $state(true);
	pushIngesteld = $state(false);
	mock = $state(false);
	fout = $state<string | null>(null);
	private gestart = false;

	start() {
		if (this.gestart) return;
		this.gestart = true;
		if (!firebaseActief) {
			this.uid = 'lokaal';
			this.naam = lees<string | null>('demo-naam', null);
			this.status = 'ingelogd';
			void this.laadIk();
			return;
		}
		const auth = fbAuth();
		zetTokenBron(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));
		getRedirectResult(auth).catch((e) => (this.fout = loginFout(e)));
		onAuthStateChanged(auth, async (u) => {
			if (!u) {
				this.uid = null;
				this.email = null;
				this.status = 'uitgelogd';
				return;
			}
			this.uid = u.uid;
			this.email = u.email;
			this.naam = u.displayName;
			this.foto = u.photoURL;
			await this.laadIk();
		});
	}

	private async laadIk() {
		try {
			const ik = await api<IkAntwoord>('/api/ik', { timeoutMs: 10000 });
			schrijf('ik', { ...ik, uid: this.uid });
			this.pasToe(ik);
		} catch (e) {
			// Offline: vertrouw de laatst bekende status van deze gebruiker
			const oud = lees<(IkAntwoord & { uid?: string }) | null>('ik', null);
			if (oud && oud.uid === this.uid) {
				this.pasToe(oud);
			} else if (!firebaseActief) {
				this.status = 'ingelogd';
			} else {
				this.fout = (e as Error).message;
				this.status = 'geweigerd';
			}
		}
	}

	private pasToe(ik: IkAntwoord) {
		this.admin = ik.admin;
		this.nsIngesteld = ik.nsIngesteld;
		this.pushIngesteld = ik.pushIngesteld;
		this.mock = ik.mock;
		this.status = ik.toegestaan ? 'ingelogd' : 'geweigerd';
	}

	async login() {
		this.fout = null;
		const auth = fbAuth();
		const provider = new GoogleAuthProvider();
		provider.setCustomParameters({ prompt: 'select_account' });
		const standalone = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
		try {
			if (standalone) await signInWithRedirect(auth, provider);
			else await signInWithPopup(auth, provider);
		} catch (e) {
			const code = (e as { code?: string }).code ?? '';
			if (/popup-blocked|operation-not-supported/.test(code)) {
				await signInWithRedirect(auth, provider).catch((e2) => (this.fout = loginFout(e2)));
			} else if (!/closed-by-user|cancelled-popup/.test(code)) {
				this.fout = loginFout(e);
			}
		}
	}

	async logout() {
		if (firebaseActief) await signOut(fbAuth());
		schrijf('ik', null);
	}

	/** Voornaam voor begroetingen */
	get voornaam(): string | null {
		return this.naam?.split(' ')[0] ?? null;
	}
}

function loginFout(e: unknown): string {
	const code = (e as { code?: string }).code ?? '';
	if (code.includes('unauthorized-domain')) return 'Dit domein is nog niet toegestaan in Firebase (Authentication → Settings → Authorized domains).';
	if (code.includes('network')) return 'Geen verbinding. Probeer het opnieuw.';
	return `Inloggen mislukt${code ? ` (${code})` : ''}.`;
}

export const sessie = new Sessie();
