<script lang="ts">
	import { ChevronRight, Footprints } from '@lucide/svelte';
	import type { Advies } from '$lib/types';
	import { adviesStatus, isOV } from '$lib/reis';
	import { duurTekst } from '$lib/tijd';
	import Tijd from './Tijd.svelte';
	import StatusLabel from './StatusLabel.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import Drukte from './Drukte.svelte';
	import Prijs from './Prijs.svelte';
	import Spoor from './Spoor.svelte';

	let { advies, href, toonPrijs = true, toonDrukte = true }: { advies: Advies; href: string; toonPrijs?: boolean; toonDrukte?: boolean } = $props();

	// Alleen wat je nodig hebt om te kiezen: tijden, duur, ritten, spoor. Status alleen als er iets is.
	const status = $derived(adviesStatus(advies));
	const eersteOV = $derived(advies.legs.find(isOV));
	const ritten = $derived(advies.legs.filter(isOV));
	const heeftNS = $derived(advies.legs.some((l) => l.isNS));
	const voorLopen = $derived(advies.legs[0] && !isOV(advies.legs[0]) ? Math.round(advies.legs[0].duur / 60) : 0);
	const toonDruk = $derived(toonDrukte && heeftNS && !!advies.drukte && advies.drukte !== 'onbekend');
	const toonGeld = $derived(toonPrijs && !!advies.prijs && advies.prijs.bedrag > 0);
</script>

<a class="advies kaart" {href} data-sveltekit-preload-data="off">
	<div class="rij tussen">
		<div class="rij tijden">
			<Tijd tijd={advies.vertrek} groot />
			<span class="zwak" aria-hidden="true">–</span>
			<Tijd tijd={advies.aankomst} groot />
		</div>
		<div class="duur">
			<span class="getal">{duurTekst(advies.duur)}</span>
			<ChevronRight size={18} aria-hidden="true" />
		</div>
	</div>

	<div class="rij tussen">
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
		{#if eersteOV}<Spoor halte={eersteOV.van} trein={eersteOV.modus === 'trein'} />{/if}
	</div>

	{#if status !== 'optijd' || toonDruk || toonGeld || advies.meldingen?.length}
		<div class="rij onder klein">
			{#if status !== 'optijd'}<StatusLabel {status} />{/if}
			{#if advies.meldingen?.length}<span class="status-fout melding-tekst">{advies.meldingen[0].kop}</span>{/if}
			{#if toonDruk}<Drukte drukte={advies.drukte} tekst={false} />{/if}
			{#if toonGeld}<span class="rechts"><Prijs prijs={advies.prijs} /></span>{/if}
		</div>
	{/if}
</a>

<style>
	.advies {
		display: flex;
		flex-direction: column;
		gap: 6px;
		color: inherit;
		text-decoration: none;
	}
	.advies:active {
		background: var(--kaart-2);
	}
	.tijden {
		gap: 6px;
		flex-wrap: wrap;
	}
	.duur {
		display: flex;
		align-items: center;
		gap: 2px;
		font-weight: 650;
		color: var(--tekst-zwak);
		white-space: nowrap;
	}
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
	.onder {
		flex-wrap: wrap;
		gap: 4px 10px;
	}
	.melding-tekst {
		font-weight: 600;
	}
	.rechts {
		margin-left: auto;
	}
</style>
