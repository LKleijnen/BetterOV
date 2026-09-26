// Firebase-initialisatie in de browser: Auth, Firestore (met offline cache) en Messaging.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
	browserLocalPersistence,
	browserPopupRedirectResolver,
	indexedDBLocalPersistence,
	initializeAuth,
	type Auth
} from 'firebase/auth';
import {
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
	memoryLocalCache,
	type Firestore
} from 'firebase/firestore';
import { firebaseConfig } from './config';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function fbApp(): FirebaseApp {
	if (!firebaseConfig) throw new Error('Firebase is niet ingesteld');
	app ??= initializeApp(firebaseConfig);
	return app;
}

export function fbAuth(): Auth {
	auth ??= initializeAuth(fbApp(), {
		persistence: [indexedDBLocalPersistence, browserLocalPersistence],
		popupRedirectResolver: browserPopupRedirectResolver
	});
	return auth;
}

export function fbDb(): Firestore {
	if (!db) {
		try {
			// Offline cache: de laatste data blijft zichtbaar bij slecht bereik
			db = initializeFirestore(fbApp(), {
				localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
				ignoreUndefinedProperties: true
			});
		} catch {
			db = initializeFirestore(fbApp(), { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
		}
	}
	return db;
}
