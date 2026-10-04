<script lang="ts">
	// Kaart van een reis: klein in de pagina, met de knop (of een tik) schermvullend.
	// Gebruikt op de reispagina en bij een reisadvies.
	import { LocateFixed, Maximize2, Minimize2 } from '@lucide/svelte';
	import type { Advies, Leg, VoertuigPositie } from '$lib/types';
	import Kaart from './Kaart.svelte';

	let {
		advies,
		ritten = [],
		kleineFocus = -1,
		eigenPositie = null,
		voertuig = null,
		groot = $bindable(false),
		focusLeg = $bindable(-1),
		onOpen,
		onLocatie
	}: {
		advies: Advies;
		/** Volledige ritten per leg (in het zwart op de kaart) */
		ritten?: (Leg | null)[];
		/** Rit waarop het kleine kaartje inzoomt (-1 = de hele reis) */
		kleineFocus?: number;
		eigenPositie?: { lat: number; lon: number; nauwkeurigheid?: number } | null;
		voertuig?: (VoertuigPositie & { label?: string }) | null;
		/** Schermvullend open */
		groot?: boolean;
		/** Rit waarop de grote kaart inzoomt (-1 = de hele reis) */
		focusLeg?: number;
		onOpen?: () => void;
		/** Knop om je locatie aan te zetten; zonder deze functie geen knop */
		onLocatie?: () => void;
	} = $props();

	function open() {
		focusLeg = -1;
		groot = true;
		onOpen?.();
	}

	function sluit() {
		groot = false;
		focusLeg = -1;
	}
</script>

{#if !groot}
	<div class="klein">
		<Kaart {advies} {ritten} focusLeg={kleineFocus} {eigenPositie} {voertuig} hoogte="190px" compact onKlik={open} />
		<button type="button" class="kaartknop vergroot" aria-label="Kaart schermvullend" onclick={open}><Maximize2 size={18} /></button>
		{#if onLocatie && !eigenPositie}
			<button type="button" class="kaartknop locatie" aria-label="Toon mijn locatie" onclick={onLocatie}><LocateFixed size={18} /></button>
		{/if}
	</div>
{:else}
	<div class="volledig" role="dialog" aria-modal="true" aria-label="Kaart">
		<Kaart {advies} {ritten} {focusLeg} {eigenPositie} {voertuig} hoogte="100%" />
		<button type="button" class="kaartknop sluit" aria-label="Kaart verkleinen" onclick={sluit}><Minimize2 size={20} /></button>
		<p class="legenda klein">
			Geel: jouw deel · zwart: de rest van de rit · grijze stipjes: tussenstops · {eigenPositie ? 'blauw: jij' : 'je eigen locatie staat uit'}{voertuig
				? voertuig.soort === 'gps'
					? ' · gele stip: de trein (GPS)'
					: ' · gele stip: geschatte positie van het voertuig'
				: ''}. Zoom in of tik op een halte voor de naam.
			{#if onLocatie && !eigenPositie}· <button type="button" class="tekstknop" onclick={onLocatie}>Locatie aanzetten</button>{/if}
		</p>
	</div>
{/if}

<svelte:window onkeydown={(e) => groot && e.key === 'Escape' && sluit()} />

<style>
	.klein {
		position: relative;
	}
	.kaartknop {
		position: absolute;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 10px;
		border: 1px solid var(--rand);
		background: var(--kaart);
		color: var(--tekst);
		box-shadow: var(--schaduw);
		cursor: pointer;
		z-index: 3;
	}
	.kaartknop.vergroot {
		top: 8px;
		right: 8px;
	}
	.kaartknop.locatie {
		top: 8px;
		left: 8px;
	}
	.volledig {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
	}
	.volledig > :global(.kaartvak) {
		flex: 1;
		border-radius: 0;
		border: 0;
	}
	.kaartknop.sluit {
		top: calc(env(safe-area-inset-top) + 10px);
		right: calc(env(safe-area-inset-right) + 54px);
	}
	.legenda {
		margin: 0;
		padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
		color: var(--tekst-zwak);
	}
</style>
