<script lang="ts">
	import type { Prijs } from '$lib/types';

	let { prijs, uitleg = false }: { prijs: Prijs | undefined; uitleg?: boolean } = $props();

	function euro(cent: number) {
		return `€ ${(cent / 100).toFixed(2).replace('.', ',')}`;
	}
</script>

{#if prijs && prijs.bedrag > 0}
	<span class="prijs getal" title={prijs.exact ? undefined : 'Schatting'} aria-label="{prijs.exact ? '' : 'ongeveer '}{euro(prijs.bedrag)}">
		{#if !prijs.exact}<span class="zwak" aria-hidden="true">±</span>{/if}{euro(prijs.bedrag)}
	</span>
	{#if uitleg}
		<ul class="lijst onderdelen klein">
			{#each prijs.onderdelen as o, i (i)}
				<li class="rij tussen">
					<span>{o.omschrijving}</span>
					<span class="getal">{o.exact ? '' : '± '}{euro(o.bedrag)}</span>
				</li>
			{/each}
			<li class="zwak">Vol tarief, 2e klas, zonder korting. NS-prijzen zijn exact; bus, tram en metro zijn een schatting.</li>
		</ul>
	{/if}
{/if}

<style>
	.prijs {
		font-weight: 700;
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.onderdelen {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
	}
</style>
