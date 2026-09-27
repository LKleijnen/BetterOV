<script lang="ts">
	import type { Halte } from '$lib/types';
	import { spoorGewijzigd } from '$lib/reis';

	let { halte, trein = true }: { halte: Pick<Halte, 'spoor' | 'geplandSpoor'>; trein?: boolean } = $props();

	const gewijzigd = $derived(spoorGewijzigd(halte));
</script>

{#if halte.spoor}
	<span class="spoorvak" class:gewijzigd>
		<span>{trein ? 'Spoor' : 'Perron'}</span>
		<strong>{halte.spoor}</strong>
		{#if gewijzigd}<s><span class="visueel-verborgen">was </span>{halte.geplandSpoor}</s>{/if}
	</span>
{/if}

<style>
	s {
		font-size: 0.75rem;
		opacity: 0.8;
	}
</style>
