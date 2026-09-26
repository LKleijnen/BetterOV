<script lang="ts">
	import { CircleCheck, CircleX, Clock, TriangleAlert } from '@lucide/svelte';
	import type { AdviesStatus } from '$lib/reis';

	let { status }: { status: AdviesStatus } = $props();

	const info = $derived(
		{
			optijd: { tekst: 'Op tijd', klasse: 'ok' },
			vertraagd: { tekst: 'Vertraagd', klasse: 'vertraagd' },
			krap: { tekst: 'Krappe overstap', klasse: 'fout' },
			onhaalbaar: { tekst: 'Overstap niet haalbaar', klasse: 'fout' },
			uitgevallen: { tekst: 'Rit valt uit', klasse: 'fout' }
		}[status]
	);
</script>

<span class="label-status {info.klasse}">
	{#if status === 'optijd'}
		<CircleCheck size={15} aria-hidden="true" />
	{:else if status === 'vertraagd'}
		<Clock size={15} aria-hidden="true" />
	{:else if status === 'uitgevallen'}
		<CircleX size={15} aria-hidden="true" />
	{:else}
		<TriangleAlert size={15} aria-hidden="true" />
	{/if}
	{info.tekst}
</span>

<style>
	.label-status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.ok {
		color: var(--ok);
		background: var(--ok-zacht);
	}
	.vertraagd {
		color: var(--vertraagd);
		background: var(--vertraagd-zacht);
	}
	.fout {
		color: var(--fout);
		background: var(--fout-zacht);
	}
</style>
