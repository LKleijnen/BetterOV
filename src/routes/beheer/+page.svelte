<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronLeft, Plus, Shield, Trash2 } from '@lucide/svelte';
	import { api } from '$lib/client/api';
	import { sessie } from '$lib/client/sessie.svelte';

	let emails = $state<{ email: string; toegevoegdOp?: string }[]>([]);
	let beheerders = $state<string[]>([]);
	let nieuw = $state('');
	let fout = $state<string | null>(null);
	let laden = $state(true);

	async function laad() {
		try {
			const r = await api<{ emails: { email: string; toegevoegdOp?: string }[]; beheerders: string[] }>('/api/beheer');
			emails = r.emails;
			beheerders = r.beheerders;
			fout = null;
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			laden = false;
		}
	}

	async function voegToe() {
		fout = null;
		try {
			await api('/api/beheer', { body: { email: nieuw } });
			nieuw = '';
			await laad();
		} catch (e) {
			fout = (e as Error).message;
		}
	}

	async function verwijder(email: string) {
		if (!confirm(`${email} verwijderen van de uitnodigingslijst?`)) return;
		try {
			await api(`/api/beheer?email=${encodeURIComponent(email)}`, { methode: 'DELETE' });
			await laad();
		} catch (e) {
			fout = (e as Error).message;
		}
	}

	onMount(laad);
</script>

<svelte:head><title>Beheer · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">Uitnodigingen</h1>
	</div>

	{#if !sessie.admin}
		<p>Alleen beheerders kunnen de uitnodigingslijst aanpassen.</p>
	{:else}
		<p class="zwak">Alleen Google-accounts met een e-mailadres op deze lijst kunnen inloggen (maximaal ongeveer 20).</p>
		<form class="kaart rij" onsubmit={(e) => (e.preventDefault(), voegToe())}>
			<input class="veld" type="email" bind:value={nieuw} placeholder="naam@gmail.com" aria-label="E-mailadres" required />
			<button class="knop" type="submit"><Plus size={18} /> Voeg toe</button>
		</form>
		{#if fout}<p class="status-fout">{fout}</p>{/if}

		<ul class="lijst kaart lijstje">
			{#each beheerders as b (b)}
				<li class="rij"><Shield size={18} aria-label="beheerder" /> <span class="flex">{b}</span> <span class="zwak klein">beheerder</span></li>
			{/each}
			{#each emails.filter((e) => !beheerders.includes(e.email)) as e (e.email)}
				<li class="rij">
					<span class="flex">{e.email}</span>
					<button class="icoonknop" aria-label="Verwijder {e.email}" onclick={() => verwijder(e.email)}><Trash2 size={18} /></button>
				</li>
			{/each}
			{#if !laden && emails.length === 0 && beheerders.length === 0}<li class="zwak">Nog niemand uitgenodigd.</li>{/if}
		</ul>
		<p class="zwak klein">{emails.filter((e) => !beheerders.includes(e.email)).length} uitgenodigd.</p>
	{/if}
</main>

<style>
	.lijstje {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.lijstje li {
		min-height: 44px;
	}
	.flex {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
