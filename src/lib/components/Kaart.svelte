<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Map as MLMap, GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
	import type { Advies, VoertuigPositie } from '$lib/types';
	import { isOV } from '$lib/reis';
	import { legLijn } from '$lib/voertuig';

	let {
		advies,
		focusLeg = -1,
		eigenPositie = null,
		voertuig = null,
		extraPunt = null,
		hoogte = '320px'
	}: {
		advies?: Advies | null;
		focusLeg?: number;
		eigenPositie?: { lat: number; lon: number; nauwkeurigheid?: number } | null;
		voertuig?: (VoertuigPositie & { label?: string }) | null;
		extraPunt?: { lat: number; lon: number; label?: string } | null;
		hoogte?: string;
	} = $props();

	let container = $state<HTMLDivElement>();
	let kaart: MLMap | undefined;
	let geladen = $state(false);
	let fout = $state<string | null>(null);

	const donker = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
	const STIJL = `https://tiles.openfreemap.org/styles/${donker ? 'dark' : 'liberty'}`;

	function routeGeoJson() {
		const features = (advies?.legs ?? []).map((leg, i) => ({
			type: 'Feature' as const,
			properties: {
				ov: isOV(leg),
				kleur: leg.isNS ? '#ffc917' : (leg.kleur ?? (isOV(leg) ? '#1d4ed8' : '#6b7280')),
				focus: focusLeg === -1 || focusLeg === i
			},
			geometry: { type: 'LineString' as const, coordinates: legLijn(leg) }
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
		const punten = gekozen.flatMap(legLijn);
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
			kaart = new maplibre.Map({
				container,
				style: STIJL,
				center: [5.3, 52.1],
				zoom: 7,
				attributionControl: { compact: true }
			});
			kaart.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			kaart.on('error', (e) => {
				if (!geladen) fout = 'Kaart kon niet worden geladen.';
				console.warn(e.error);
			});
			kaart.on('load', () => {
				if (!kaart) return;
				kaart.addSource('route', { type: 'geojson', data: routeGeoJson() });
				kaart.addSource('haltes', { type: 'geojson', data: haltesGeoJson() });
				kaart.addSource('ik', { type: 'geojson', data: puntGeoJson(eigenPositie) });
				kaart.addSource('voertuig', { type: 'geojson', data: puntGeoJson(voertuig) });
				kaart.addSource('extra', { type: 'geojson', data: puntGeoJson(extraPunt) });
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
				const b = grenzen();
				if (b) kaart.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });
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
		void focusLeg;
		if (!geladen || !kaart) return;
		const b = grenzen();
		if (b) kaart.fitBounds(b, { padding: 40, maxZoom: 16 });
	});
</script>

<div class="kaartvak" style:height={hoogte}>
	<div class="kaart-el" bind:this={container} role="region" aria-label="Kaart met de route"></div>
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
