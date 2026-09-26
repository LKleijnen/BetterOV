<script lang="ts">
	import { CalendarDays, ChevronRight, History, Info, LogOut, Settings, Shield, Smartphone } from '@lucide/svelte';
	import { sessie } from '$lib/client/sessie.svelte';
	import { firebaseActief } from '$lib/client/config';
	import Onderblad from '$lib/components/Onderblad.svelte';
	import InstallatieUitleg from '$lib/components/InstallatieUitleg.svelte';

	let uitlegOpen = $state(false);
</script>

<svelte:head><title>Meer · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<h1>Meer</h1>
	{#if sessie.email}
		<p class="zwak">Ingelogd als {sessie.email}</p>
	{:else if !firebaseActief}
		<p class="zwak">Demo-modus: gegevens staan alleen op dit apparaat.</p>
	{/if}

	<ul class="lijst kaart menu">
		<li><a href="/instellingen"><Settings size={20} /> <span>Instellingen en meldingen</span> <ChevronRight size={18} /></a></li>
		<li><a href="/weekplanning"><CalendarDays size={20} /> <span>Weekplanning (vaste reizen)</span> <ChevronRight size={18} /></a></li>
		<li><a href="/geschiedenis"><History size={20} /> <span>Eerdere reizen</span> <ChevronRight size={18} /></a></li>
		<li><button onclick={() => (uitlegOpen = true)}><Smartphone size={20} /> <span>Op beginscherm zetten</span> <ChevronRight size={18} /></button></li>
		{#if sessie.admin && firebaseActief}
			<li><a href="/beheer"><Shield size={20} /> <span>Beheer: uitnodigingen</span> <ChevronRight size={18} /></a></li>
		{/if}
		<li><a href="/over"><Info size={20} /> <span>Over, bronnen en privacy</span> <ChevronRight size={18} /></a></li>
	</ul>

	{#if firebaseActief}
		<button class="knop tweede" onclick={() => sessie.logout()}><LogOut size={18} /> Uitloggen</button>
	{/if}
</main>

<Onderblad bind:open={uitlegOpen} titel="Zet BetterOV op je beginscherm">
	<InstallatieUitleg />
</Onderblad>

<style>
	.menu {
		padding: 4px 0;
	}
	.menu li + li {
		border-top: 1px solid var(--rand);
	}
	.menu a,
	.menu button {
		appearance: none;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 16px;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-decoration: none;
		text-align: left;
		cursor: pointer;
	}
	.menu span {
		flex: 1;
	}
	.menu :global(svg:last-child) {
		color: var(--tekst-zwak);
	}
</style>
