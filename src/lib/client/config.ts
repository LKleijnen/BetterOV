// Publieke configuratie (Firebase-webconfig is niet geheim). Leeg = demo-modus zonder login.

import { env } from '$env/dynamic/public';

/** Draait de app als geïnstalleerde webapp (vanaf het beginscherm)? */
export function alsApp(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as unknown as { standalone?: boolean }).standalone === true
	);
}

/**
 * Domein voor het Google-inlogscherm. Als webapp moet dat hetzelfde domein zijn als de app
 * (via de proxy in src/routes/__/[...pad]): iPhone en Android blokkeren in app-modus de opslag
 * van firebaseapp.com, waardoor het inloggen na de terugkeer stilletjes mislukt.
 */
function authDomein(): string {
	if (env.PUBLIC_FIREBASE_AUTH_DOMAIN) return env.PUBLIC_FIREBASE_AUTH_DOMAIN;
	const eigen = typeof location !== 'undefined' && location.protocol === 'https:' && !/^(localhost|127\.)/.test(location.hostname);
	if (eigen && alsApp()) return location.host;
	return `${env.PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
}

export const firebaseConfig = env.PUBLIC_FIREBASE_API_KEY
	? {
			apiKey: env.PUBLIC_FIREBASE_API_KEY,
			authDomain: authDomein(),
			projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
			appId: env.PUBLIC_FIREBASE_APP_ID,
			messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
			storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET || undefined
		}
	: null;

export const vapidKey = env.PUBLIC_FIREBASE_VAPID_KEY || '';

export const firebaseActief = !!firebaseConfig;
