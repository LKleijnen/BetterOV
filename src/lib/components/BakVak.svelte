<script lang="ts">
	// Eén bak van de trein, liggend zoals op het perron. Met de afbeelding van NS als die er is,
	// anders een eenvoudig blok (geel bij eerste klas, afgeronde kop aan de uiteinden van een treinstel).
	let {
		afbeelding,
		eersteKlas = false,
		kop,
		hoogte = 34,
		onload
	}: {
		afbeelding?: string;
		eersteKlas?: boolean;
		/** Uiteinde van een treinstel: die kant afronden */
		kop?: 'links' | 'rechts' | 'beide';
		hoogte?: number;
		onload?: () => void;
	} = $props();

	let mislukt = $state(false);
</script>

{#if afbeelding && !mislukt}
	<img class="bak" src={afbeelding} alt="" style:height="{hoogte}px" {onload} onerror={() => (mislukt = true)} />
{:else}
	<div
		class="bak schets"
		class:eerste={eersteKlas}
		class:links={kop === 'links' || kop === 'beide'}
		class:rechts={kop === 'rechts' || kop === 'beide'}
		style:height="{Math.round(hoogte * 0.8)}px"
		style:width="{Math.round(hoogte * 1.15)}px"
	></div>
{/if}

<style>
	.bak {
		display: block;
		flex: 0 0 auto;
	}
	img.bak {
		width: auto;
		min-width: 40px;
	}
	.schets {
		border-radius: 4px;
		background: var(--kaart-2);
		border: 2px solid var(--rand);
	}
	.schets.eerste {
		background: #ffc917;
		border-color: #e6b200;
	}
	.schets.links {
		border-top-left-radius: 14px;
	}
	.schets.rechts {
		border-top-right-radius: 14px;
	}
</style>
