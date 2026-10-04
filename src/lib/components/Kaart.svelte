<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { Map as MLMap, GeoJSONSource, LngLatBoundsLike, Marker } from 'maplibre-gl';
	import { TrainTrack } from '@lucide/svelte';
	import type { Advies, Leg, VoertuigPositie } from '$lib/types';
	import type { SpoorNetwerk } from '$lib/spoor';
	import { isOV } from '$lib/reis';
	import { lijnOverSpoor, spoorNetwerk, wilSpoor } from '$lib/client/spoorkaart';
	import { lees, schrijf } from '$lib/client/opslag';
	import { weergave } from '$lib/client/thema.svelte';
	// MapLibre zoekt zijn worker naast het eigen script; na bundelen staat die ergens anders
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

	let {
		advies,
		focusLeg = -1,
		eigenPositie = null,
		voertuig = null,
		extraPunt = null,
		hoogte = '320px',
		compact = false,
		onKlik,
		punten = [],
		midden = null,
		ritten = []
	}: {
		advies?: Advies | null;
		focusLeg?: number;
		eigenPositie?: { lat: number; lon: number; nauwkeurigheid?: number } | null;
		voertuig?: (VoertuigPositie & { label?: string }) | null;
		extraPunt?: { lat: number; lon: number; label?: string } | null;
		hoogte?: string;
		/** Klein kaartje in de pagina: niet te verschuiven (scrollt niet mee met je vinger) en zonder knoppen */
		compact?: boolean;
		/** Tik op een compact kaartje (bijvoorbeeld om hem groot te openen) */
		onKlik?: () => void;
		/** Losse punten met een naam (bijvoorbeeld voorzieningen op een station); tik toont de naam */
		punten?: { lat: number; lon: number; naam: string; kleur?: string }[];
		/** Middelpunt en zoom als er geen route is om op in te zoomen */
		midden?: { lat: number; lon: number; zoom?: number } | null;
		/** Per rit van het advies de volledige rit (alle haltes): in het zwart, met jouw deel in geel erop */
		ritten?: (Leg | null)[];
	} = $props();

	let container = $state<HTMLDivElement>();
	let kaart: MLMap | undefined;
	let geladen = $state(false);
	let fout = $state<string | null>(null);

	// Treinen over het echte spoor (NS SpoorKaart) en optioneel alle spoorlijnen als laag
	let spoor = $state.raw<SpoorNetwerk | null>(null);
	let spoorLaag = $state(lees('kaart-spoorlaag', false));
	const lijnen = $derived((advies?.legs ?? []).map((leg) => lijnOverSpoor(leg, spoor)));
	const ritLijnen = $derived(ritten.map((r) => (r ? lijnOverSpoor(r, spoor) : null)));

	$effect(() => {
		const nodig = spoorLaag || (advies?.legs ?? []).some(wilSpoor) || ritten.some((r) => !!r && wilSpoor(r));
		if (!nodig || spoor) return;
		void spoorNetwerk().then((n) => (spoor = n));
	});

	function wisselSpoorLaag() {
		spoorLaag = !spoorLaag;
		schrijf('kaart-spoorlaag', spoorLaag);
	}

	function spoorGeoJson() {
		const features =
			spoorLaag && spoor
				? [
						{
							type: 'Feature' as const,
							properties: {},
							geometry: { type: 'MultiLineString' as const, coordinates: spoor.randen.map((r) => r.lijn) }
						}
					]
				: [];
		return { type: 'FeatureCollection' as const, features };
	}

	const donker = weergave.donker;
	const STIJL = `https://tiles.openfreemap.org/styles/${donker ? 'dark' : 'liberty'}`;

	function routeGeoJson() {
		const features = (advies?.legs ?? []).map((leg, i) => ({
			type: 'Feature' as const,
			properties: {
				ov: isOV(leg),
				kleur: leg.isNS ? '#ffc917' : (leg.kleur ?? (isOV(leg) ? '#1d4ed8' : '#6b7280')),
				focus: focusLeg === -1 || focusLeg === i
			},
			geometry: { type: 'LineString' as const, coordinates: lijnen[i] }
		}));
		return { type: 'FeatureCollection' as const, features };
	}

	function haltesGeoJson() {
		const features = (advies?.legs ?? [])
			.filter(isOV)
			.flatMap((leg) => [leg.van, leg.naar])
			.map((h) => ({
				type: 'Feature' as const,
				properties: { naam: h.naam },
				geometry: { type: 'Point' as const, coordinates: [h.lon, h.lat] }
			}));
		return { type: 'FeatureCollection' as const, features };
	}

	function puntGeoJson(p: { lat: number; lon: number; label?: string } | null) {
		return {
			type: 'FeatureCollection' as const,
			features: p
				? [{ type: 'Feature' as const, properties: { label: p.label ?? '' }, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] } }]
				: []
		};
	}

	function rittenGeoJson() {
		return {
			type: 'FeatureCollection' as const,
			features: ritLijnen
				.map((lijn, i) => ({ lijn, i }))
				.filter((x): x is { lijn: [number, number][]; i: number } => !!x.lijn && x.lijn.length > 1)
				.map(({ lijn, i }) => ({
					type: 'Feature' as const,
					properties: { focus: focusLeg === -1 || focusLeg === i },
					geometry: { type: 'LineString' as const, coordinates: lijn }
				}))
		};
	}

	// ---------- Haltes onderweg (ook van de rest van de rit), met naam bij tikken of inzoomen ----------
	interface Halteje {
		sleutel: string;
		naam: string;
		lat: number;
		lon: number;
		/** Treinstation: de naam linkt naar de stationspagina */
		station: boolean;
		/** Begin of eind van jouw rit (die heeft al een grote stip) */
		eigen: boolean;
	}
	const LABEL_ZOOM = 12;
	const haltejes = $derived.by((): Halteje[] => {
		const uit = new Map<string, Halteje>();
		(advies?.legs ?? []).forEach((leg, i) => {
			if (!isOV(leg)) return;
			const rit = ritten[i];
			const eigen = new Set([leg.van.naam, leg.naar.naam]);
			const lijst = rit ? [rit.van, ...rit.tussenstops, rit.naar] : [leg.van, ...leg.tussenstops, leg.naar];
			for (const h of lijst) {
				if (!h.naam || !Number.isFinite(h.lat) || !Number.isFinite(h.lon)) continue;
				const sleutel = `${h.naam}|${h.lat.toFixed(3)}|${h.lon.toFixed(3)}`;
				const bestaand = uit.get(sleutel);
				const nieuw = { sleutel, naam: h.naam, lat: h.lat, lon: h.lon, station: leg.modus === 'trein', eigen: eigen.has(h.naam) };
				uit.set(sleutel, bestaand ? { ...bestaand, eigen: bestaand.eigen || nieuw.eigen } : nieuw);
			}
		});
		return [...uit.values()];
	});

	function haltejesGeoJson() {
		return {
			type: 'FeatureCollection' as const,
			features: haltejes
				.filter((h) => !h.eigen)
				.map((h) => ({ type: 'Feature' as const, properties: { sleutel: h.sleutel }, geometry: { type: 'Point' as const, coordinates: [h.lon, h.lat] } }))
		};
	}

	let ml: typeof import('maplibre-gl') | undefined;
	let labels: { sleutel: string; el: HTMLElement; marker: Marker }[] = [];
	let gekozen: string | null = null;

	function toonLabels() {
		if (!kaart) return;
		const dichtbij = kaart.getZoom() >= LABEL_ZOOM;
		for (const l of labels) l.el.hidden = !(dichtbij || l.sleutel === gekozen);
	}

	function tekenLabels(lijst: Halteje[]) {
		for (const l of labels) l.marker.remove();
		labels = [];
		if (!kaart || !ml || compact) return;
		for (const h of lijst) {
			const el = document.createElement(h.station ? 'a' : 'span');
			el.className = 'haltelabel';
			el.textContent = h.naam;
			if (el instanceof HTMLAnchorElement) {
				el.href = `/station?${new URLSearchParams({ naam: h.naam, lat: String(h.lat), lon: String(h.lon) })}`;
				el.setAttribute('aria-label', `Station ${h.naam}`);
			}
			const marker = new ml.Marker({ element: el, anchor: 'left', offset: [9, 0] }).setLngLat([h.lon, h.lat]).addTo(kaart);
			labels.push({ sleutel: h.sleutel, el, marker });
		}
		toonLabels();
	}

	function puntenGeoJson() {
		return {
			type: 'FeatureCollection' as const,
			features: punten.map((p) => ({
				type: 'Feature' as const,
				properties: { naam: p.naam, kleur: p.kleur ?? '#2563eb' },
				geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }
			}))
		};
	}

	function grenzen(): LngLatBoundsLike | null {
		const legs = advies?.legs ?? [];
		const gekozen = focusLeg >= 0 && legs[focusLeg] ? [legs[focusLeg]] : legs;
		const punten = gekozen.flatMap((leg) => lijnen[legs.indexOf(leg)] ?? []);
		if (eigenPositie && focusLeg < 0) punten.push([eigenPositie.lon, eigenPositie.lat]);
		if (extraPunt) punten.push([extraPunt.lon, extraPunt.lat]);
		if (punten.length === 0) return null;
		let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
		for (const [x, y] of punten) {
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
		return [
			[minX, minY],
			[maxX, maxY]
		];
	}

	onMount(async () => {
		try {
			const maplibre = await import('maplibre-gl');
			ml = maplibre;
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (!container) return;
			maplibre.setWorkerUrl(workerUrl);
			kaart = new maplibre.Map({
				container,
				style: STIJL,
				center: midden ? [midden.lon, midden.lat] : [5.3, 52.1],
				zoom: midden ? (midden.zoom ?? 16) : 7,
				interactive: !compact,
				attributionControl: { compact: true }
			});
			if (!compact) kaart.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			kaart.on('error', (e) => {
				if (!geladen) fout = 'Kaart kon niet worden geladen.';
				console.warn(e.error);
			});
			kaart.on('load', () => {
				if (!kaart) return;
				kaart.addSource('spoor', { type: 'geojson', data: spoorGeoJson() });
				kaart.addSource('route', { type: 'geojson', data: routeGeoJson() });
				kaart.addSource('haltes', { type: 'geojson', data: haltesGeoJson() });
				kaart.addSource('ik', { type: 'geojson', data: puntGeoJson(eigenPositie) });
				kaart.addSource('voertuig', { type: 'geojson', data: puntGeoJson(voertuig) });
				kaart.addSource('extra', { type: 'geojson', data: puntGeoJson(extraPunt) });
				kaart.addSource('punten', { type: 'geojson', data: puntenGeoJson() });
				kaart.addSource('ritten', { type: 'geojson', data: rittenGeoJson() });
				kaart.addSource('haltejes', { type: 'geojson', data: haltejesGeoJson() });
				kaart.addLayer({
					id: 'spoor',
					type: 'line',
					source: 'spoor',
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: { 'line-color': donker ? '#8b95a7' : '#5b6474', 'line-width': 1.6, 'line-opacity': 0.7 }
				});
				// De hele rit van het voertuig, onder jouw deel
				kaart.addLayer({
					id: 'ritten',
					type: 'line',
					source: 'ritten',
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: { 'line-color': donker ? '#d1d5db' : '#111827', 'line-width': 3.5, 'line-opacity': ['case', ['get', 'focus'], 0.75, 0.25] }
				});
				kaart.addLayer({
					id: 'route-rand',
					type: 'line',
					source: 'route',
					filter: ['==', ['get', 'ov'], true],
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: { 'line-color': '#0b1a4a', 'line-width': 8, 'line-opacity': ['case', ['get', 'focus'], 0.9, 0.25] }
				});
				kaart.addLayer({
					id: 'route-ov',
					type: 'line',
					source: 'route',
					filter: ['==', ['get', 'ov'], true],
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: { 'line-color': ['get', 'kleur'], 'line-width': 5, 'line-opacity': ['case', ['get', 'focus'], 1, 0.35] }
				});
				kaart.addLayer({
					id: 'route-lopen',
					type: 'line',
					source: 'route',
					filter: ['==', ['get', 'ov'], false],
					layout: { 'line-cap': 'round' },
					paint: { 'line-color': donker ? '#cbd5e1' : '#4b5563', 'line-width': 4, 'line-dasharray': [0.5, 1.8] }
				});
				kaart.addLayer({
					id: 'haltejes',
					type: 'circle',
					source: 'haltejes',
					// Grijs en klein als je uitzoomt (anders zit de kaart er vol mee), groter bij inzoomen
					paint: {
						'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 10, 2.5, 13, 4, 16, 6],
						'circle-color': '#9ca3af',
						'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 1.5],
						'circle-stroke-color': donker ? '#1f2937' : '#ffffff'
					}
				});
				if (!compact) {
					// Tik op een halte: naam tonen (en daarmee de link naar het station)
					kaart.on('click', (e) => {
						const f = kaart?.queryRenderedFeatures(e.point, { layers: ['haltejes', 'haltes'] })[0];
						const p = f?.properties;
						gekozen = p?.sleutel ?? (p?.naam ? (haltejes.find((h) => h.naam === p.naam)?.sleutel ?? null) : null);
						toonLabels();
					});
					kaart.on('zoomend', toonLabels);
				}
				kaart.addLayer({
					id: 'haltes',
					type: 'circle',
					source: 'haltes',
					paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': '#0b1a4a' }
				});
				kaart.addLayer({
					id: 'punten',
					type: 'circle',
					source: 'punten',
					paint: { 'circle-radius': 7, 'circle-color': ['get', 'kleur'], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
				});
				// Naam van een punt tonen bij een tik (zonder lettertypes van de kaartstijl nodig te hebben)
				kaart.on('click', 'punten', (e) => {
					const f = e.features?.[0];
					if (!f || !kaart) return;
					const [x, y] = (f.geometry as { coordinates: [number, number] }).coordinates;
					new maplibre.Popup({ closeButton: false, offset: 10 }).setLngLat([x, y]).setText(String(f.properties?.naam ?? '')).addTo(kaart);
				});
				kaart.on('mouseenter', 'punten', () => kaart && (kaart.getCanvas().style.cursor = 'pointer'));
				kaart.on('mouseleave', 'punten', () => kaart && (kaart.getCanvas().style.cursor = ''));
				kaart.addLayer({
					id: 'extra',
					type: 'circle',
					source: 'extra',
					paint: { 'circle-radius': 9, 'circle-color': '#e11d48', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }
				});
				kaart.addLayer({
					id: 'voertuig',
					type: 'circle',
					source: 'voertuig',
					paint: { 'circle-radius': 10, 'circle-color': '#ffc917', 'circle-stroke-width': 3, 'circle-stroke-color': '#0b1a4a' }
				});
				kaart.addLayer({
					id: 'ik-halo',
					type: 'circle',
					source: 'ik',
					paint: { 'circle-radius': 16, 'circle-color': '#2563eb', 'circle-opacity': 0.2 }
				});
				kaart.addLayer({
					id: 'ik',
					type: 'circle',
					source: 'ik',
					paint: { 'circle-radius': 7, 'circle-color': '#2563eb', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }
				});
				geladen = true;
				tekenLabels(haltejes);
			});
		} catch (e) {
			fout = 'Kaart kon niet worden geladen.';
			console.warn(e);
		}
	});

	onDestroy(() => {
		for (const l of labels) l.marker.remove();
		kaart?.remove();
	});

	$effect(() => {
		const r = routeGeoJson();
		const h = haltesGeoJson();
		if (!geladen || !kaart) return;
		(kaart.getSource('route') as GeoJSONSource | undefined)?.setData(r);
		(kaart.getSource('haltes') as GeoJSONSource | undefined)?.setData(h);
	});
	$effect(() => {
		const d = spoorGeoJson();
		if (geladen && kaart) (kaart.getSource('spoor') as GeoJSONSource | undefined)?.setData(d);
	});
	$effect(() => {
		const d = puntGeoJson(eigenPositie);
		if (geladen && kaart) (kaart.getSource('ik') as GeoJSONSource | undefined)?.setData(d);
	});
	$effect(() => {
		const d = puntGeoJson(voertuig);
		if (geladen && kaart) (kaart.getSource('voertuig') as GeoJSONSource | undefined)?.setData(d);
	});
	$effect(() => {
		const d = puntGeoJson(extraPunt);
		if (geladen && kaart) (kaart.getSource('extra') as GeoJSONSource | undefined)?.setData(d);
	});
	$effect(() => {
		const d = puntenGeoJson();
		if (geladen && kaart) (kaart.getSource('punten') as GeoJSONSource | undefined)?.setData(d);
	});
	$effect(() => {
		const r = rittenGeoJson();
		const h = haltejesGeoJson();
		const lijst = haltejes;
		if (!geladen || !kaart) return;
		(kaart.getSource('ritten') as GeoJSONSource | undefined)?.setData(r);
		(kaart.getSource('haltejes') as GeoJSONSource | undefined)?.setData(h);
		untrack(() => tekenLabels(lijst));
	});
	// Alleen opnieuw inzoomen als de route of de gekozen rit verandert, niet bij elke GPS-update
	const routeSleutel = $derived(`${focusLeg}|${lijnen.map((l) => `${l.length}:${l[0]?.join(',')}:${l[l.length - 1]?.join(',')}`).join('|')}`);
	let eersteKeer = true;
	$effect(() => {
		void routeSleutel;
		if (!geladen || !kaart) return;
		untrack(() => {
			const b = grenzen();
			if (b) kaart!.fitBounds(b, { padding: 40, maxZoom: 16, duration: eersteKeer ? 0 : 600 });
			eersteKeer = false;
		});
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (de pagina heeft een eigen knop om te vergroten) -->
<div
	class="kaartvak"
	class:klikbaar={compact && !!onKlik}
	style:height={hoogte}
	onclick={(e) => {
		if (compact && onKlik && !(e.target as Element).closest('.maplibregl-ctrl')) onKlik();
	}}
>
	<div class="kaart-el" bind:this={container} role="region" aria-label="Kaart met de route"></div>
	{#if geladen && !compact}
		<button type="button" class="spoorknop" aria-pressed={spoorLaag} onclick={wisselSpoorLaag} title="Spoorlijnen tonen">
			<TrainTrack size={16} aria-hidden="true" /> Spoor
		</button>
	{/if}
	{#if fout}<div class="kaartfout zwak klein">{fout}</div>{/if}
</div>

<style>
	.kaartvak {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--rand);
		background: var(--kaart-2);
	}
	.kaart-el {
		position: absolute;
		inset: 0;
	}
	.klikbaar {
		cursor: pointer;
	}
	.kaartvak :global(.haltelabel) {
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--kaart);
		color: var(--tekst);
		border: 1px solid var(--rand);
		box-shadow: var(--schaduw);
		font-size: 0.75rem;
		font-weight: 650;
		white-space: nowrap;
		text-decoration: none;
	}
	.kaartvak :global(a.haltelabel) {
		color: var(--primair);
	}
	.kaartvak :global(.haltelabel[hidden]) {
		display: none;
	}
	.spoorknop {
		position: absolute;
		top: 10px;
		left: 10px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		border-radius: 999px;
		border: 1px solid var(--rand);
		background: var(--kaart);
		color: var(--tekst);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 650;
		box-shadow: var(--schaduw);
		cursor: pointer;
	}
	.spoorknop[aria-pressed='true'] {
		background: var(--tekst);
		color: var(--bg);
	}
	.kaartfout {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 16px;
	}
</style>
