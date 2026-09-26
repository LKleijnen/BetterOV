/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Service worker: app-schil offline beschikbaar, pushmeldingen tonen en openen.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `betterov-${version}`;
const SCHIL = '/';
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
			try {
				await cache.add(new Request(SCHIL, { cache: 'reload' }));
			} catch {
				// schil wordt later gecachet
			}
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const sleutel of await caches.keys()) if (sleutel !== CACHE) await caches.delete(sleutel);
			await sw.clients.claim();
		})()
	);
});

async function metTimeout(verzoek: Request, ms: number): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	try {
		return await fetch(verzoek, { signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

sw.addEventListener('fetch', (event) => {
	const verzoek = event.request;
	if (verzoek.method !== 'GET') return;
	const url = new URL(verzoek.url);
	if (url.origin !== sw.location.origin) return;
	// API en Firebase-auth altijd via het netwerk; de app regelt zelf de cache met tijdstip
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')) return;

	if (verzoek.mode === 'navigate') {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				try {
					const antwoord = await metTimeout(verzoek, 4000);
					if (antwoord.ok && url.pathname === SCHIL) await cache.put(SCHIL, antwoord.clone());
					return antwoord;
				} catch {
					// Slecht bereik: de app-schil uit de cache; de router toont de juiste pagina
					return (await cache.match(SCHIL)) ?? Response.error();
				}
			})()
		);
		return;
	}

	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				return (await cache.match(url.pathname)) ?? fetch(verzoek);
			})()
		);
	}
});

interface PushData {
	titel?: string;
	tekst?: string;
	url?: string;
	tag?: string;
}

function leesPush(event: PushEvent): PushData {
	try {
		const ruw = event.data?.json() as Record<string, unknown> | undefined;
		if (!ruw) return {};
		// FCM stuurt { data: {...}, notification?: {...} }
		const data = (ruw.data as PushData | undefined) ?? (ruw as PushData);
		const melding = ruw.notification as { title?: string; body?: string } | undefined;
		return { ...data, titel: data.titel ?? melding?.title, tekst: data.tekst ?? melding?.body };
	} catch {
		return { tekst: event.data?.text() };
	}
}

sw.addEventListener('push', (event) => {
	const d = leesPush(event);
	event.waitUntil(
		sw.registration.showNotification(d.titel ?? 'BetterOV', {
			body: d.tekst ?? 'Er is een wijziging in je reis.',
			tag: d.tag ?? 'reis',
			data: { url: d.url ?? '/reis' },
			icon: '/icon-192.png',
			badge: '/badge-72.png',
			// @ts-expect-error renotify bestaat in Chrome maar niet in de TS-types
			renotify: true
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const doel = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '/reis', sw.location.origin).href;
	event.waitUntil(
		(async () => {
			const vensters = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const venster of vensters) {
				if (new URL(venster.url).origin === sw.location.origin) {
					await venster.focus();
					if ('navigate' in venster) await (venster as WindowClient).navigate(doel).catch(() => {});
					return;
				}
			}
			await sw.clients.openWindow(doel);
		})()
	);
});
