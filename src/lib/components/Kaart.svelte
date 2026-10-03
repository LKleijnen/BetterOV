<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { Map as MLMap, GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
	import { TrainTrack } from '@lucide/svelte';
	import type { Advies, VoertuigPositie } from '$lib/types';
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
		onKlik
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
	} = $props();

	let container = $state<HTMLDivElement>();
	let kaart: MLMap | undefined;
	let geladen = $state(false);
	let fout = $state<string | null>(null);

	// Treinen over het echte spoor (NS SpoorKaart) en optioneel alle spoorlijnen als laag
	let spoor = $state.raw<SpoorNetwerk | null>(null);
	let spoorLaag = $state(lees('kaart-spoorlaag', false));
	const lijnen = $derived((advies?.legs ?? []).map((leg) => lijnOverSpoor(leg, spoor)));

	$effect(() => {
		const nodig = spoorLaag || (advies?.legs ?? []).some(wilSpoor);
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
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (!container) return;
			maplibre.setWorkerUrl(workerUrl);
			kaart = new maplibre.Map({
				container,
				style: STIJL,
				center: [5.3, 52.1],
				zoom: 7,
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
				kaart.addLayer({
					id: 'spoor',
					type: 'line',
					source: 'spoor',
					layout: { 'line-cap': 'round', 'line-join': 'round' },
					paint: { 'line-color': donker ? '#8b95a7' : '#5b6474', 'line-width': 1.6, 'line-opacity': 0.7 }
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
					id: 'haltes',
					type: 'circle',
					source: 'haltes',
					paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': '#0b1a4a' }
				});
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
			});
		} catch (e) {
			fout = 'Kaart kon niet worden geladen.';
			console.warn(e);
		}
	});

	onDestroy(() => kaart?.remove());

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
