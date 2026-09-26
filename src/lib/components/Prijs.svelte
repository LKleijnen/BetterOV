<script lang="ts">
	import type { Prijs } from '$lib/types';

	let { prijs, uitleg = false }: { prijs: Prijs | undefined; uitleg?: boolean } = $props();

	function euro(cent: number) {
		return `€ ${(cent / 100).toFixed(2).replace('.', ',')}`;
	}
</script>

{#if prijs && prijs.bedrag > 0}
	<span class="prijs getal">
		{#if !prijs.exact}<span class="zwak" aria-hidden="true">±</span>{/if}{euro(prijs.bedrag)}
		{#if !prijs.exact}<span class="indicatie">indicatie</span>{/if}
	</span>
	{#if uitleg}
		<ul class="lijst onderdelen klein">
			{#each prijs.onderdelen as o, i (i)}
				<li class="rij tussen">
					<span>{o.omschrijving}</span>
					<span class="getal">{o.exact ? '' : '± '}{euro(o.bedrag)}{o.exact ? '' : ' (indicatie)'}</span>
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
	.indicatie {
		margin-left: 4px;
		font-size: 0.72rem;
		font-weight: 650;
		padding: 1px 5px;
		border-radius: 5px;
		background: var(--kaart-2);
		color: var(--tekst-zwak);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.onderdelen {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 6px;
	}
</style>
