<script lang="ts">
	// Eén bak van de trein, rechtop getekend (voorkant boven). Met een afbeelding van NS als die er is:
	// per bak, of een uitsnede uit de afbeelding van het hele treinstel. Anders een eenvoudig blok.
	let {
		afbeelding,
		deelAfbeelding,
		index = 0,
		aantal = 1,
		omgekeerd = false,
		eersteKlas = false,
		hoogte = 88
	}: {
		afbeelding?: string;
		deelAfbeelding?: string;
		index?: number;
		aantal?: number;
		/** Kop van de afbeelding rechts in plaats van links: andersom draaien */
		omgekeerd?: boolean;
		eersteKlas?: boolean;
		hoogte?: number;
	} = $props();

	let mislukt = $state(false);
	const breedte = $derived(Math.round(hoogte / 3.2));
	const draai = $derived(omgekeerd ? -90 : 90);
</script>

<div class="bak" class:eerste={eersteKlas} class:schets={mislukt || (!afbeelding && !deelAfbeelding)} style:width="{breedte}px" style:height="{hoogte}px">
	{#if afbeelding && !mislukt}
		<img
			src={afbeelding}
			alt=""
			loading="lazy"
			style:width="{hoogte}px"
			style:height="{breedte}px"
			style:transform="translate(-50%, -50%) rotate({draai}deg)"
			onerror={() => (mislukt = true)}
		/>
	{:else if deelAfbeelding && !mislukt}
		<div
			class="uitsnede"
			style:width="{hoogte}px"
			style:height="{breedte}px"
			style:background-image="url('{deelAfbeelding}')"
			style:background-size="{aantal * 100}% 100%"
			style:background-position-x="{aantal > 1 ? (index / (aantal - 1)) * 100 : 0}%"
			style:transform="translate(-50%, -50%) rotate({draai}deg)"
		></div>
	{/if}
</div>

<style>
	.bak {
		position: relative;
		flex: 0 0 auto;
		overflow: hidden;
		border-radius: 6px;
	}
	.bak.schets {
		background: var(--kaart-2);
		border: 2px solid var(--rand);
	}
	.bak.schets.eerste {
		background: #ffc917;
		border-color: #e6b200;
	}
	img,
	.uitsnede {
		position: absolute;
		left: 50%;
		top: 50%;
		object-fit: contain;
		background-repeat: no-repeat;
	}
</style>
