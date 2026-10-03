<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import type { Advies } from '$lib/types';
	import { adviesStatus, isOV } from '$lib/reis';
	import { duurTekst } from '$lib/tijd';
	import Tijd from './Tijd.svelte';
	import StatusLabel from './StatusLabel.svelte';
	import LegOverzicht from './LegOverzicht.svelte';
	import Drukte from './Drukte.svelte';
	import Prijs from './Prijs.svelte';
	import Spoor from './Spoor.svelte';
	import { LABEL_NAMEN, type AdviesLabel } from '$lib/labels';

	let {
		advies,
		href,
		toonPrijs = true,
		toonDrukte = true,
		labels = []
	}: { advies: Advies; href: string; toonPrijs?: boolean; toonDrukte?: boolean; labels?: AdviesLabel[] } = $props();

	// Alleen wat je nodig hebt om te kiezen: tijden, duur, ritten, spoor. Status alleen als er iets is.
	const status = $derived(adviesStatus(advies));
	const eersteOV = $derived(advies.legs.find(isOV));
	const heeftNS = $derived(advies.legs.some((l) => l.isNS));
	const toonDruk = $derived(toonDrukte && heeftNS && !!advies.drukte && advies.drukte !== 'onbekend');
	const toonGeld = $derived(toonPrijs && !!advies.prijs && advies.prijs.bedrag > 0);
</script>

<a class="advies kaart" {href} data-sveltekit-preload-data="off">
	{#if labels.length}
		<div class="rij labels">
			{#each labels as l (l)}<span class="adviestag {l}">{LABEL_NAMEN[l]}</span>{/each}
		</div>
	{/if}
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
		<LegOverzicht {advies} />
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
	.labels {
		gap: 4px;
		flex-wrap: wrap;
		margin-bottom: -2px;
	}
	.adviestag {
		padding: 1px 7px;
		border-radius: 6px;
		font-size: 0.72rem;
		font-weight: 750;
		background: var(--primair-zacht);
		color: var(--primair);
	}
	.adviestag.goedkoopst,
	.adviestag.rustigst {
		background: var(--ok-zacht);
		color: var(--ok);
	}
</style>
