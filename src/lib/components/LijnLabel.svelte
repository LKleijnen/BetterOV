<script lang="ts">
	import type { Leg } from '$lib/types';
	import ModusIcoon from './ModusIcoon.svelte';

	let { leg }: { leg: Leg } = $props();

	const tekst = $derived(leg.modus === 'trein' ? (leg.lijn ?? 'Trein') : (leg.lijn ?? ''));
	const eigenKleur = $derived(leg.kleur && leg.modus !== 'trein' ? leg.kleur : undefined);
</script>

<span
	class="lijnlabel"
	class:trein={leg.modus === 'trein'}
	class:ns={leg.isNS}
	class:uit={leg.uitgevallen}
	style:background={eigenKleur}
	style:color={eigenKleur ? (leg.tekstKleur ?? '#fff') : undefined}
>
	<ModusIcoon modus={leg.modus} grootte={15} />
	{#if tekst}<span>{tekst}</span>{/if}
</span>

<style>
	.lijnlabel {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px;
		border-radius: 7px;
		background: var(--kaart-2);
		color: var(--tekst);
		font-size: 0.82rem;
		font-weight: 750;
		white-space: nowrap;
		border: 1px solid var(--rand);
	}
	.ns {
		background: #ffc917;
		color: #0b1a4a;
		border-color: #e6b200;
	}
	.uit {
		text-decoration: line-through;
		opacity: 0.7;
	}
</style>
