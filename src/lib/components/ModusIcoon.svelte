<script lang="ts">
	import { Bike, Bus, Car, Footprints, Ship, TrainFront, TramFront, Route } from '@lucide/svelte';
	import type { Modus } from '$lib/types';

	let { modus, grootte = 20, label = true }: { modus: Modus; grootte?: number; label?: boolean } = $props();

	const namen: Record<Modus, string> = {
		trein: 'Trein',
		bus: 'Bus',
		tram: 'Tram',
		metro: 'Metro',
		veer: 'Veerboot',
		lopen: 'Lopen',
		fiets: 'Fiets',
		auto: 'Auto',
		overig: 'Vervoer'
	};
</script>

<span class="modus" role={label ? 'img' : undefined} aria-label={label ? namen[modus] : undefined} aria-hidden={label ? undefined : 'true'}>
	{#if modus === 'trein'}
		<TrainFront size={grootte} />
	{:else if modus === 'bus'}
		<Bus size={grootte} />
	{:else if modus === 'tram'}
		<TramFront size={grootte} />
	{:else if modus === 'metro'}
		<span class="m" style:width="{grootte}px" style:height="{grootte}px" style:font-size="{grootte * 0.7}px">M</span>
	{:else if modus === 'veer'}
		<Ship size={grootte} />
	{:else if modus === 'lopen'}
		<Footprints size={grootte} />
	{:else if modus === 'fiets'}
		<Bike size={grootte} />
	{:else if modus === 'auto'}
		<Car size={grootte} />
	{:else}
		<Route size={grootte} />
	{/if}
</span>

<style>
	.modus {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}
	.m {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 2px solid currentColor;
		border-radius: 4px;
		font-weight: 800;
	}
</style>
