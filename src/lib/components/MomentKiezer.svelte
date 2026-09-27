<script lang="ts">
	import { planner } from '$lib/client/planner.svelte';
	import { nlDatum, nlTijd } from '$lib/tijd';
	import Onderblad from './Onderblad.svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();

	// Lokale kopie: pas bij "Klaar" overnemen
	let aankomst = $state(false);
	let datum = $state(nlDatum());
	let tijd = $state(nlTijd());

	$effect(() => {
		if (!open) return;
		aankomst = planner.aankomst;
		datum = planner.nu ? nlDatum() : planner.datum;
		tijd = planner.nu ? nlTijd() : planner.tijd;
	});

	function nu() {
		planner.nu = true;
		planner.aankomst = false;
		open = false;
	}

	function klaar() {
		planner.zetMoment(datum, tijd, aankomst);
		open = false;
	}
</script>

<Onderblad bind:open titel="Wanneer">
	<div class="stapel">
		<div class="chips" role="group" aria-label="Vertrek of aankomst">
			<button type="button" class="chip" aria-pressed={!aankomst} onclick={() => (aankomst = false)}>Vertrek</button>
			<button type="button" class="chip" aria-pressed={aankomst} onclick={() => (aankomst = true)}>Aankomst</button>
		</div>
		<div class="rij velden">
			<label class="stapel veldlabel">
				<span class="label">Datum</span>
				<input class="veld" type="date" bind:value={datum} required />
			</label>
			<label class="stapel veldlabel">
				<span class="label">Tijd</span>
				<input class="veld" type="time" bind:value={tijd} required />
			</label>
		</div>
		<div class="rij knoppen">
			<button type="button" class="knop tweede" onclick={nu}>Nu</button>
			<button type="button" class="knop" onclick={klaar}>Klaar</button>
		</div>
	</div>
</Onderblad>

<style>
	.velden,
	.knoppen {
		gap: 8px;
	}
	.veldlabel {
		flex: 1;
		gap: 4px;
	}
	.knoppen .knop {
		flex: 1;
	}
</style>
