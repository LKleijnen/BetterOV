<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import type { Plek } from '$lib/types';
	import { planner } from '$lib/client/planner.svelte';
	import { ALLE_VERVOER, EXTRA_OVERSTAPTIJDEN, STANDAARD_REISOPTIES, VERVOER_NAMEN, type Reisopties, type Vervoer } from '$lib/reisopties';
	import Onderblad from './Onderblad.svelte';
	import PlekInvoer from './PlekInvoer.svelte';
	import ModusIcoon from './ModusIcoon.svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();

	// Lokale kopie; pas bij "Klaar" overnemen
	let o = $state<Reisopties>({ ...STANDAARD_REISOPTIES });
	let via = $state<Plek | null>(null);

	$effect(() => {
		if (!open) return;
		o = { ...planner.opties, vervoer: [...planner.opties.vervoer] };
		via = planner.via;
	});

	function wisselVervoer(v: Vervoer) {
		const aan = o.vervoer.includes(v);
		// Minstens één vervoermiddel moet aan blijven
		if (aan && o.vervoer.length === 1) return;
		o.vervoer = aan ? o.vervoer.filter((x) => x !== v) : ALLE_VERVOER.filter((x) => x === v || o.vervoer.includes(x));
	}

	function standaard() {
		o = { ...STANDAARD_REISOPTIES, vervoer: [...ALLE_VERVOER] };
		via = null;
	}

	function klaar() {
		planner.zetOpties(o);
		planner.via = via;
		open = false;
	}
</script>

<Onderblad bind:open titel="Reisopties">
	<div class="stapel">
		<section class="stapel groep">
			<PlekInvoer label="Via" bind:waarde={via} alleenHaltes gps={false} wisbaar placeholder="Halte of station (optioneel)" />
		</section>

		<section class="stapel groep">
			<h3 id="extra-kop">Extra overstaptijd</h3>
			<div class="chips wrap" role="group" aria-labelledby="extra-kop">
				{#each EXTRA_OVERSTAPTIJDEN as m (m)}
					<button type="button" class="chip" aria-pressed={o.extraOverstaptijd === m} onclick={() => (o.extraOverstaptijd = m)}>{m === 0 ? 'Geen' : `${m} min`}</button>
				{/each}
			</div>
			<p class="zwak klein">Zoveel tijd wil je minstens over hebben bij een overstap, bovenop het lopen.</p>
		</section>

		<section class="stapel groep">
			<h3 id="vervoer-kop">Vervoermiddelen</h3>
			<div class="chips wrap vervoer" role="group" aria-labelledby="vervoer-kop">
				{#each ALLE_VERVOER as v (v)}
					<button type="button" class="chip" aria-pressed={o.vervoer.includes(v)} onclick={() => wisselVervoer(v)}>
						<ModusIcoon modus={v} grootte={16} label={false} /> {VERVOER_NAMEN[v]}
					</button>
				{/each}
			</div>
		</section>

		<section class="groep">
			<label class="rij tussen schakelaar">
				<span>Treinen met reservering verbergen<br /><span class="zwak klein">Zoals Eurostar en nachttreinen</span></span>
				<input type="checkbox" role="switch" bind:checked={o.zonderReservering} />
			</label>
			<label class="rij tussen schakelaar">
				<span>Toegankelijk reizen<br /><span class="zwak klein">Looproutes zonder trappen</span></span>
				<input type="checkbox" role="switch" bind:checked={o.toegankelijk} />
			</label>
		</section>

		<div class="rij knoppen">
			<button type="button" class="knop tweede" onclick={standaard}><RotateCcw size={16} /> Standaard</button>
			<button type="button" class="knop" onclick={klaar}>Klaar</button>
		</div>
	</div>
</Onderblad>

<style>
	h3 {
		margin: 0;
		font-size: 0.9rem;
	}
	.groep {
		gap: 6px;
	}
	.groep p {
		margin: 0;
	}
	.vervoer .chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.schakelaar {
		min-height: 52px;
		gap: 12px;
		cursor: pointer;
	}
	.schakelaar + .schakelaar {
		border-top: 1px solid var(--rand);
	}
	.knoppen {
		gap: 8px;
	}
	.knoppen .knop {
		flex: 1;
	}
</style>
