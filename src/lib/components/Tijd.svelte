<script lang="ts">
	import type { Tijd } from '$lib/types';
	import { klok, vertragingMinuten } from '$lib/tijd';

	let { tijd, groot = false, uitgevallen = false }: { tijd: Tijd | undefined; groot?: boolean; uitgevallen?: boolean } = $props();

	const vertraging = $derived(vertragingMinuten(tijd));
</script>

{#if tijd}
	<span class="tijdblok" class:groot>
		{#if uitgevallen}
			<span class="tijd doorgestreept">{klok(tijd.gepland)}</span>
		{:else if vertraging !== 0}
			<span class="tijd" class:status-vertraagd={vertraging > 0}>{klok(tijd.verwacht)}</span>
			<span class="oud tijd" aria-label="gepland {klok(tijd.gepland)}">{klok(tijd.gepland)}</span>
			{#if vertraging > 0}
				<span class="vertraging status-vertraagd">+{vertraging}</span>
			{:else}
				<span class="vertraging zwak">{vertraging}</span>
			{/if}
		{:else}
			<span class="tijd">{klok(tijd.verwacht)}</span>
		{/if}
	</span>
{/if}

<style>
	.tijdblok {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tijd {
		font-weight: 700;
	}
	.groot .tijd {
		font-size: 1.5rem;
		font-weight: 750;
		letter-spacing: -0.01em;
	}
	.oud {
		font-weight: 500;
		font-size: 0.85rem;
		text-decoration: line-through;
		color: var(--tekst-zwak);
	}
	.groot .oud {
		font-size: 0.95rem;
	}
	.doorgestreept {
		text-decoration: line-through;
		color: var(--fout);
	}
	.vertraging {
		font-weight: 750;
		font-size: 0.9rem;
	}
	.groot .vertraging {
		font-size: 1rem;
	}
</style>
