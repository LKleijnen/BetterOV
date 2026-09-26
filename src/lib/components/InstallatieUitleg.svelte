<script lang="ts">
	import { Share, SquarePlus, EllipsisVertical, Download } from '@lucide/svelte';
	import { isIOS } from '$lib/client/push';
</script>

<div class="stapel">
	{#if isIOS()}
		<p>Op iPhone werken meldingen tijdens je reis alleen als de app op je beginscherm staat.</p>
		<ol class="stappen">
			<li>Open deze pagina in <strong>Safari</strong>.</li>
			<li>Tik op <Share size={16} aria-label="Deel" /> <strong>Deel</strong> onderin.</li>
			<li>Kies <SquarePlus size={16} aria-hidden="true" /> <strong>Zet op beginscherm</strong> en tik op <strong>Voeg toe</strong>.</li>
			<li>Open BetterOV vanaf je beginscherm en log daar opnieuw in (de app op je beginscherm heeft een eigen login).</li>
			<li>Zet meldingen aan via <strong>Meer → Instellingen</strong>.</li>
		</ol>
	{:else}
		<p>Installeer de app op je beginscherm; dan opent hij als een gewone app en krijg je meldingen tijdens je reis.</p>
		<ol class="stappen">
			<li>Tik in Chrome op <EllipsisVertical size={16} aria-label="menu" /> rechtsboven.</li>
			<li>Kies <Download size={16} aria-hidden="true" /> <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.</li>
			<li>Zet meldingen aan via <strong>Meer → Instellingen</strong>.</li>
		</ol>
	{/if}
</div>

<style>
	.stappen {
		margin: 0;
		padding-left: 1.3rem;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.stappen :global(svg) {
		vertical-align: -3px;
	}
	p {
		margin: 0;
	}
</style>
