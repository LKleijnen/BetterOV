// Publieke configuratie (Firebase-webconfig is niet geheim). Leeg = demo-modus zonder login.

import { env } from '$env/dynamic/public';

export const firebaseConfig = env.PUBLIC_FIREBASE_API_KEY
	? {
			apiKey: env.PUBLIC_FIREBASE_API_KEY,
			authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN || `${env.PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
			projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
			appId: env.PUBLIC_FIREBASE_APP_ID,
			messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
			storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET || undefined
		}
	: null;

export const vapidKey = env.PUBLIC_FIREBASE_VAPID_KEY || '';

export const firebaseActief = !!firebaseConfig;
