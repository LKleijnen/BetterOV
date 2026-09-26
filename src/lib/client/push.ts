// Pushmeldingen aanzetten: toestemming vragen en het FCM-token opslaan in Firestore.

import { alsApp, firebaseActief, vapidKey } from './config';
import { fbApp } from './firebase';
import { data } from './data.svelte';
import { lees, schrijf } from './opslag';

export type PushStatus = 'aan' | 'uit' | 'geweigerd' | 'niet-ondersteund' | 'niet-ingesteld';

export function isIOS(): boolean {
	return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export const isStandalone = alsApp;

export function pushStatus(): PushStatus {
	if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
		return 'niet-ondersteund';
	}
	if (Notification.permission === 'denied') return 'geweigerd';
	if (Notification.permission === 'granted' && lees<string | null>('push-token', null)) return 'aan';
	return 'uit';
}

export async function zetPushAan(): Promise<{ status: PushStatus; melding?: string }> {
	if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
		return {
			status: 'niet-ondersteund',
			melding: isIOS() && !isStandalone() ? 'Zet de app eerst op je beginscherm; op iPhone werken meldingen alleen dan.' : 'Dit apparaat ondersteunt geen pushmeldingen.'
		};
	}
	const toestemming = await Notification.requestPermission();
	if (toestemming !== 'granted') return { status: 'geweigerd', melding: 'Meldingen zijn geblokkeerd in de instellingen van je browser.' };
	if (!firebaseActief || !vapidKey) {
		return { status: 'niet-ingesteld', melding: 'Meldingen werken zolang de app open is. Voor meldingen op de achtergrond moet Firebase Cloud Messaging nog worden ingesteld.' };
	}
	try {
		const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
		if (!(await isSupported())) return { status: 'niet-ondersteund', melding: 'Deze browser ondersteunt geen pushmeldingen.' };
		const registratie = await navigator.serviceWorker.ready;
		const token = await getToken(getMessaging(fbApp()), { vapidKey, serviceWorkerRegistration: registratie });
		await data.registreerPushToken(token);
		schrijf('push-token', token);
		return { status: 'aan' };
	} catch (e) {
		return { status: 'uit', melding: `Aanzetten mislukt: ${(e as Error).message}` };
	}
}

/** Lokale melding (als de app open of op de achtergrond is, zonder server) */
export async function lokaleMelding(titel: string, tekst: string, url = '/reis', tag = 'reis') {
	if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
	try {
		const reg = await navigator.serviceWorker.ready;
		await reg.showNotification(titel, { body: tekst, tag, data: { url }, icon: '/icon-192.png', badge: '/badge-72.png' });
	} catch {
		// negeren
	}
}
