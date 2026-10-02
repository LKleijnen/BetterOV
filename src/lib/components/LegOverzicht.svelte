<script lang="ts">
	import { ChevronRight, Footprints } from '@lucide/svelte';
	import type { Advies } from '$lib/types';
	import { isOV } from '$lib/reis';
	import LijnLabel from './LijnLabel.svelte';

	// De ritten van een reis achter elkaar met > ertussen, zoals in de lijst met reisadviezen
	let { advies }: { advies: Pick<Advies, 'legs'> } = $props();

	const ritten = $derived(advies.legs.filter(isOV));
	const voorLopen = $derived(advies.legs[0] && !isOV(advies.legs[0]) ? Math.round(advies.legs[0].duur / 60) : 0);
</script>

<div class="rij legs">
	{#if voorLopen > 0}
		<span class="lopen zwak" aria-label="{voorLopen} min lopen"><Footprints size={15} aria-hidden="true" />{voorLopen}</span>
		{#if ritten.length}<ChevronRight size={13} aria-hidden="true" class="zwak" />{/if}
	{/if}
	{#if ritten.length === 0 && voorLopen === 0}
		<span class="lopen zwak"><Footprints size={15} aria-hidden="true" /> Lopend</span>
	{/if}
	{#each ritten as leg, i (i)}
		{#if i > 0}<ChevronRight size={13} aria-hidden="true" class="zwak" />{/if}
		<LijnLabel {leg} />
	{/each}
</div>

<style>
	.legs {
		flex-wrap: wrap;
		gap: 3px;
		min-width: 0;
	}
	.lopen {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		font-size: 0.82rem;
		font-weight: 650;
	}
</style>
