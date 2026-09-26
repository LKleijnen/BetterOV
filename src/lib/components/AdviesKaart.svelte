<script lang="ts">
	import { ArrowRight, ChevronRight } from '@lucide/svelte';
	import type { Advies } from '$lib/types';
	import { adviesStatus, isOV, spoorGewijzigd } from '$lib/reis';
	import { duurTekst } from '$lib/tijd';
	import Tijd from './Tijd.svelte';
	import StatusLabel from './StatusLabel.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import Drukte from './Drukte.svelte';
	import Prijs from './Prijs.svelte';
	import ModusIcoon from './ModusIcoon.svelte';

	let { advies, href, toonPrijs = true, toonDrukte = true }: { advies: Advies; href: string; toonPrijs?: boolean; toonDrukte?: boolean } = $props();

	const status = $derived(adviesStatus(advies));
	const eersteOV = $derived(advies.legs.find(isOV));
	const ovLegs = $derived(advies.legs.filter((l) => isOV(l)));
	const heeftNS = $derived(advies.legs.some((l) => l.isNS));
	const looptijd = $derived(
		advies.legs[0] && !isOV(advies.legs[0]) ? Math.round(advies.legs[0].duur / 60) : 0
	);
</script>

<a class="advies kaart" {href} data-sveltekit-preload-data="off">
	<div class="rij tussen boven">
		<div class="rij tijden">
			<Tijd tijd={advies.vertrek} groot />
			<ArrowRight size={18} aria-hidden="true" class="zwak" />
			<Tijd tijd={advies.aankomst} groot />
		</div>
		<div class="duur">
			<span class="getal">{duurTekst(advies.duur)}</span>
			<ChevronRight size={20} aria-hidden="true" />
		</div>
	</div>

	<div class="rij legs">
		{#if ovLegs.length === 0}
			<span class="rij"><ModusIcoon modus="lopen" grootte={16} /> Lopend</span>
		{/if}
		{#each ovLegs as leg, i (i)}
			{#if i > 0}<ChevronRight size={14} aria-hidden="true" class="zwak" />{/if}
			<LijnLabel {leg} />
		{/each}
	</div>

	<div class="rij info klein">
		<StatusLabel {status} />
		<span class="zwak">{advies.overstappen === 0 ? 'Direct' : `${advies.overstappen}× overstappen`}</span>
		{#if eersteOV?.van.spoor}
			<span class:spoorwissel={spoorGewijzigd(eersteOV.van)}>
				{eersteOV.modus === 'trein' ? 'Spoor' : 'Perron'} {eersteOV.van.spoor}{#if spoorGewijzigd(eersteOV.van)}<span class="visueel-verborgen"> (gewijzigd)</span>{/if}
			</span>
		{/if}
		{#if looptijd > 0}<span class="zwak">{looptijd} min lopen</span>{/if}
	</div>

	{#if (toonDrukte && heeftNS && advies.drukte) || (toonPrijs && advies.prijs)}
		<div class="rij info klein">
			{#if toonDrukte && heeftNS && advies.drukte}<Drukte drukte={advies.drukte} />{/if}
			{#if toonPrijs && advies.prijs}<span class="rechts"><Prijs prijs={advies.prijs} /></span>{/if}
		</div>
	{/if}
	{#if advies.meldingen?.length}
		<div class="klein status-fout">{advies.meldingen[0].kop}</div>
	{/if}
</a>

<style>
	.advies {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: inherit;
		text-decoration: none;
	}
	.advies:active {
		background: var(--kaart-2);
	}
	.tijden {
		gap: 8px;
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
		gap: 4px;
	}
	.info {
		flex-wrap: wrap;
		gap: 6px 12px;
	}
	.rechts {
		margin-left: auto;
	}
	.spoorwissel {
		font-weight: 750;
		color: var(--vertraagd);
		background: var(--vertraagd-zacht);
		padding: 0 6px;
		border-radius: 6px;
	}
	.boven {
		align-items: flex-start;
	}
</style>
