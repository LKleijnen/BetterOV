<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, ChevronLeft, Copy, Link, Plus, Share2, Shield, Trash2 } from '@lucide/svelte';
	import { api } from '$lib/client/api';
	import { sessie } from '$lib/client/sessie.svelte';
	import { korteDatum } from '$lib/tijd';

	interface Uitnodiging {
		id: string;
		notitie?: string;
		aangemaaktOp: string;
		verlooptOp: string;
		gebruiktDoor?: string;
		gebruiktOp?: string;
		status: 'open' | 'gebruikt' | 'verlopen';
	}

	let emails = $state<{ email: string; toegevoegdOp?: string }[]>([]);
	let beheerders = $state<string[]>([]);
	let uitnodigingen = $state<Uitnodiging[]>([]);
	let nieuw = $state('');
	let fout = $state<string | null>(null);
	let laden = $state(true);

	// Nieuwe link: alleen direct na het maken zichtbaar (de server bewaart alleen een hash)
	let notitie = $state('');
	let link = $state<string | null>(null);
	let linkBezig = $state(false);
	let gekopieerd = $state(false);

	const open = $derived(uitnodigingen.filter((u) => u.status === 'open'));
	const gebruikt = $derived(uitnodigingen.filter((u) => u.status === 'gebruikt').slice(0, 5));
	const uitgenodigd = $derived(emails.filter((e) => !beheerders.includes(e.email)));

	async function laad() {
		try {
			const [lijst, links] = await Promise.all([
				api<{ emails: { email: string; toegevoegdOp?: string }[]; beheerders: string[] }>('/api/beheer'),
				api<{ uitnodigingen: Uitnodiging[] }>('/api/beheer/uitnodigingen')
			]);
			emails = lijst.emails;
			beheerders = lijst.beheerders;
			uitnodigingen = links.uitnodigingen;
			fout = null;
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			laden = false;
		}
	}

	async function maakLink() {
		linkBezig = true;
		fout = null;
		try {
			const r = await api<{ code: string }>('/api/beheer/uitnodigingen', { body: { notitie } });
			link = `${location.origin}/uitnodiging/${r.code}`;
			notitie = '';
			await laad();
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			linkBezig = false;
		}
	}

	async function deel() {
		if (!link) return;
		const tekst = 'Je bent uitgenodigd voor BetterOV. Open de link en log in met je Google-account.';
		if (navigator.share) {
			await navigator.share({ title: 'Uitnodiging BetterOV', text: tekst, url: link }).catch(() => {});
		} else {
			await kopieer();
		}
	}

	async function kopieer() {
		if (!link) return;
		await navigator.clipboard.writeText(link).catch(() => {});
		gekopieerd = true;
		setTimeout(() => (gekopieerd = false), 2000);
	}

	async function trekIn(u: Uitnodiging) {
		if (!confirm('Deze uitnodigingslink intrekken? Hij werkt daarna niet meer.')) return;
		try {
			await api(`/api/beheer/uitnodigingen?id=${u.id}`, { methode: 'DELETE' });
			await laad();
		} catch (e) {
			fout = (e as Error).message;
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
		<p>Alleen beheerders kunnen mensen uitnodigen.</p>
	{:else}
		{#if fout}<p class="status-fout">{fout}</p>{/if}

		<section class="kaart stapel" aria-labelledby="link-kop">
			<h2 id="link-kop" class="rij"><Link size={20} aria-hidden="true" /> Uitnodigen met een link</h2>
			{#if link}
				<div class="link klein">{link}</div>
				<div class="rij knoppen">
					<button class="knop" onclick={deel}><Share2 size={18} /> Delen</button>
					<button class="knop tweede" onclick={kopieer}>{#if gekopieerd}<Check size={18} /> Gekopieerd{:else}<Copy size={18} /> Kopieer{/if}</button>
				</div>
				<p class="zwak klein">Werkt één keer en is 7 dagen geldig. De link is alleen nu te zien.</p>
				<button class="knop tweede klein" onclick={() => (link = null)}>Nog een link maken</button>
			{:else}
				<form class="stapel" onsubmit={(e) => (e.preventDefault(), maakLink())}>
					<input class="veld" bind:value={notitie} maxlength="60" placeholder="Voor wie? (optioneel, bijv. Oma)" aria-label="Voor wie is de link" />
					<button class="knop" type="submit" disabled={linkBezig}><Plus size={18} /> {linkBezig ? 'Maken…' : 'Maak uitnodigingslink'}</button>
				</form>
				<p class="zwak klein">Stuur de link via WhatsApp of mail. Wie hem opent en inlogt met Google, krijgt meteen toegang.</p>
			{/if}

			{#if open.length > 0}
				<h3>Nog niet gebruikt</h3>
				<ul class="lijst lijstje">
					{#each open as u (u.id)}
						<li class="rij">
							<span class="flex">{u.notitie ?? `Link van ${korteDatum(u.aangemaaktOp)}`}<br /><span class="zwak klein">Geldig tot {korteDatum(u.verlooptOp)}</span></span>
							<button class="icoonknop" aria-label="Intrekken" onclick={() => trekIn(u)}><Trash2 size={18} /></button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if gebruikt.length > 0}
				<h3>Gebruikt</h3>
				<ul class="lijst lijstje klein">
					{#each gebruikt as u (u.id)}
						<li class="rij"><span class="flex">{u.notitie ? `${u.notitie}: ` : ''}{u.gebruiktDoor}</span><span class="zwak">{u.gebruiktOp ? korteDatum(u.gebruiktOp) : ''}</span></li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="kaart stapel" aria-labelledby="toegang-kop">
			<h2 id="toegang-kop">Wie heeft toegang</h2>
			<ul class="lijst lijstje">
				{#each beheerders as b (b)}
					<li class="rij"><Shield size={18} aria-label="beheerder" /> <span class="flex">{b}</span> <span class="zwak klein">beheerder</span></li>
				{/each}
				{#each uitgenodigd as e (e.email)}
					<li class="rij">
						<span class="flex">{e.email}</span>
						<button class="icoonknop" aria-label="Verwijder {e.email}" onclick={() => verwijder(e.email)}><Trash2 size={18} /></button>
					</li>
				{/each}
				{#if !laden && emails.length === 0 && beheerders.length === 0}<li class="zwak">Nog niemand uitgenodigd.</li>{/if}
			</ul>
			<form class="rij" onsubmit={(e) => (e.preventDefault(), voegToe())}>
				<input class="veld" type="email" bind:value={nieuw} placeholder="of voeg een Gmail-adres toe" aria-label="E-mailadres" required />
				<button class="knop tweede" type="submit" aria-label="Voeg toe"><Plus size={18} /></button>
			</form>
		</section>
	{/if}
</main>

<style>
	h2.rij {
		gap: 8px;
		margin: 0;
	}
	h3 {
		margin: 4px 0 0;
		font-size: 0.9rem;
		color: var(--tekst-zwak);
	}
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
	.link {
		padding: 10px;
		border-radius: 10px;
		background: var(--kaart-2);
		word-break: break-all;
	}
	.knoppen {
		gap: 8px;
	}
	.knoppen .knop {
		flex: 1;
	}
</style>
