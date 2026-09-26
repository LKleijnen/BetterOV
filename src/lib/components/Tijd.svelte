<script lang="ts">
	import type { Tijd } from '$lib/types';
	import { klok, vertragingMinuten } from '$lib/tijd';

	let {
		tijd,
		groot = false,
		uitgevallen = false,
		stapel = false
	}: { tijd: Tijd | undefined; groot?: boolean; uitgevallen?: boolean; stapel?: boolean } = $props();

	const vertraging = $derived(vertragingMinuten(tijd));
</script>

{#if tijd}
	<span class="tijdblok" class:groot class:stapel>
		{#if uitgevallen}
			<span class="tijd doorgestreept">{klok(tijd.gepland)}</span>
		{:else if vertraging !== 0}
			<span class="tijd" class:status-vertraagd={vertraging > 0}>{klok(tijd.verwacht)}</span>
			{#if stapel}
				<span class="oud tijd" aria-label="gepland {klok(tijd.gepland)}">{klok(tijd.gepland)}</span>
			{:else}
				<span class="vertraging" class:status-vertraagd={vertraging > 0} class:zwak={vertraging < 0} aria-label="gepland {klok(tijd.gepland)}">{vertraging > 0 ? '+' : ''}{vertraging}</span>
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
		gap: 5px;
		flex-wrap: wrap;
	}
	.tijdblok.stapel {
		flex-direction: column;
		align-items: flex-start;
		gap: 0;
		line-height: 1.15;
	}
	.tijd {
		font-weight: 700;
	}
	.groot .tijd {
		font-size: 1.3rem;
		font-weight: 750;
		letter-spacing: -0.01em;
	}
	.oud {
		font-weight: 500;
		font-size: 0.8rem;
		text-decoration: line-through;
		color: var(--tekst-zwak);
	}
	.doorgestreept {
		text-decoration: line-through;
		color: var(--fout);
	}
	.vertraging {
		font-weight: 750;
		font-size: 0.85rem;
	}
	.groot .vertraging {
		font-size: 0.95rem;
	}
</style>
