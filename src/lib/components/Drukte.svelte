<script lang="ts">
	import { User } from '@lucide/svelte';
	import type { Drukte } from '$lib/types';

	let { drukte, tekst = true }: { drukte: Drukte | undefined; tekst?: boolean } = $props();

	const niveau = $derived(drukte === 'laag' ? 1 : drukte === 'gemiddeld' ? 2 : drukte === 'hoog' ? 3 : 0);
	const woord = $derived(drukte === 'laag' ? 'Rustig' : drukte === 'gemiddeld' ? 'Gemiddeld druk' : drukte === 'hoog' ? 'Druk' : 'Drukte onbekend');
	const klasse = $derived(niveau === 3 ? 'status-fout' : niveau === 2 ? 'status-vertraagd' : 'status-ok');
</script>

{#if niveau > 0}
	<span class="drukte {klasse}" title={woord} aria-label={woord} role="img">
		{#each [1, 2, 3] as i (i)}
			<span class:uit={i > niveau}><User size={14} strokeWidth={2.6} aria-hidden="true" /></span>
		{/each}
		{#if tekst}<span class="woord">{woord}</span>{/if}
	</span>
{/if}

<style>
	.drukte {
		display: inline-flex;
		align-items: center;
		gap: 0;
		font-size: 0.82rem;
		font-weight: 650;
	}
	.uit {
		opacity: 0.25;
	}
	.woord {
		margin-left: 4px;
	}
</style>
