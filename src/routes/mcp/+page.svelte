<script lang="ts">
	import { onMount } from 'svelte';
	import { Bot, Check, ChevronLeft, Copy, KeyRound, Plus, Trash2 } from '@lucide/svelte';
	import { api } from '$lib/client/api';
	import { sessie } from '$lib/client/sessie.svelte';
	import { firebaseActief } from '$lib/client/config';
	import { korteDatum } from '$lib/tijd';

	interface Sleutel {
		id: string;
		naam?: string;
		staart: string;
		aangemaaktOp: string;
		laatstGebruiktOp?: string;
	}

	let sleutels = $state<Sleutel[]>([]);
	let naam = $state('');
	let nieuw = $state<string | null>(null);
	let bezig = $state(false);
	let laden = $state(true);
	let fout = $state<string | null>(null);
	let gekopieerd = $state<string | null>(null);

	let adres = $state('/api/mcp');
	const voorbeeldSleutel = $derived(nieuw ?? 'bov_JOUW_SLEUTEL');
	const opdracht = $derived(`claude mcp add --transport http betterov ${adres} --header "Authorization: Bearer ${voorbeeldSleutel}"`);

	async function laad() {
		try {
			sleutels = (await api<{ sleutels: Sleutel[] }>('/api/mcp-sleutels')).sleutels;
			fout = null;
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			laden = false;
		}
	}

	async function maak() {
		bezig = true;
		fout = null;
		try {
			nieuw = (await api<{ sleutel: string }>('/api/mcp-sleutels', { body: { naam } })).sleutel;
			naam = '';
			await laad();
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			bezig = false;
		}
	}

	async function trekIn(s: Sleutel) {
		if (!confirm(`Sleutel ${s.naam ?? `…${s.staart}`} intrekken? De assistent kan er daarna niet meer bij.`)) return;
		try {
			await api(`/api/mcp-sleutels?id=${s.id}`, { methode: 'DELETE' });
			await laad();
		} catch (e) {
			fout = (e as Error).message;
		}
	}

	async function kopieer(tekst: string, wat: string) {
		await navigator.clipboard.writeText(tekst).catch(() => {});
		gekopieerd = wat;
		setTimeout(() => (gekopieerd = null), 2000);
	}

	onMount(() => {
		adres = `${location.origin}/api/mcp`;
		if (firebaseActief && sessie.email) laad();
		else laden = false;
	});
</script>

<svelte:head><title>AI-assistent · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">AI-assistent</h1>
	</div>

	<section class="kaart stapel">
		<h2 class="rij"><Bot size={20} aria-hidden="true" /> Wat is dit?</h2>
		<p>
			Je kunt een AI-assistent (zoals Claude of ChatGPT) aan BetterOV koppelen. Daarna kun je gewoon vragen stellen:
			<em>“Hoe reis ik nu naar huis?”</em>, <em>“Welke trein moet ik pakken?”</em>, <em>“In welk deel van de trein moet ik zitten?”</em>
			of <em>“Haal ik mijn overstap nog?”</em>
		</p>
		<p class="zwak klein">
			De assistent kan alles wat de app ook kan: reizen plannen, vertrektijden en stations bekijken, zien hoe de trein is
			samengesteld en hoe druk hij is, en je lopende reis bekijken. Hij mag ook een reis starten of afronden — dan bewaakt
			BetterOV die reis en krijg je meldingen, net als wanneer je het zelf in de app doet.
		</p>
	</section>

	{#if !firebaseActief}
		<section class="kaart stapel">
			<p>Dit werkt alleen als BetterOV met Firebase is ingesteld. In demo-modus staan je gegevens alleen in deze browser.</p>
		</section>
	{:else if !sessie.email}
		<section class="kaart stapel"><p>Log eerst in om een sleutel te maken.</p></section>
	{:else}
		{#if fout}<p class="status-fout">{fout}</p>{/if}

		<section class="kaart stapel">
			<h2 class="rij"><KeyRound size={20} aria-hidden="true" /> Stap 1: maak een sleutel</h2>
			{#if nieuw}
				<p class="klein">Dit is je sleutel. Hij is <strong>alleen nu te zien</strong> — kopieer hem eerst.</p>
				<div class="code klein">{nieuw}</div>
				<button class="knop" onclick={() => kopieer(nieuw!, 'sleutel')}>
					{#if gekopieerd === 'sleutel'}<Check size={18} /> Gekopieerd{:else}<Copy size={18} /> Kopieer sleutel{/if}
				</button>
				<p class="zwak klein">Bewaar hem als een wachtwoord: wie hem heeft, kan bij je reizen en je thuislocatie.</p>
				<button class="knop tweede klein" onclick={() => (nieuw = null)}>Klaar</button>
			{:else}
				<form class="stapel" onsubmit={(e) => (e.preventDefault(), maak())}>
					<input class="veld" bind:value={naam} maxlength="40" placeholder="Waarvoor is de sleutel? (bijv. Claude op mijn telefoon)" aria-label="Naam van de sleutel" />
					<button class="knop" type="submit" disabled={bezig}><Plus size={18} /> {bezig ? 'Maken…' : 'Maak een sleutel'}</button>
				</form>
			{/if}
		</section>

		<section class="kaart stapel">
			<h2>Stap 2: koppel je assistent</h2>
			<p class="klein">Het adres van BetterOV voor assistenten:</p>
			<div class="code klein">{adres}</div>
			<button class="knop tweede klein" onclick={() => kopieer(adres, 'adres')}>
				{#if gekopieerd === 'adres'}<Check size={18} /> Gekopieerd{:else}<Copy size={18} /> Kopieer adres{/if}
			</button>

			<h3>In Claude (of een andere assistent met “MCP”)</h3>
			<ol class="klein stappen">
				<li>Zoek in de instellingen naar <strong>Connectors</strong> of <strong>MCP-servers</strong> en kies “toevoegen”.</li>
				<li>Soort verbinding: <strong>HTTP</strong> (soms “Streamable HTTP” of “remote server”).</li>
				<li>Adres: het adres hierboven.</li>
				<li>
					Voeg een kop (“header”) toe met naam <code>Authorization</code> en als waarde
					<code>Bearer {voorbeeldSleutel}</code>.
				</li>
			</ol>

			<h3>Met Claude Code in de terminal</h3>
			<div class="code klein">{opdracht}</div>
			<button class="knop tweede klein" onclick={() => kopieer(opdracht, 'opdracht')}>
				{#if gekopieerd === 'opdracht'}<Check size={18} /> Gekopieerd{:else}<Copy size={18} /> Kopieer opdracht{/if}
			</button>

			<h3>Als je alleen een adres kwijt kan</h3>
			<p class="zwak klein">
				Sommige programma’s kunnen geen koppen meegeven. Dan mag de sleutel ook in het adres:
				<code>{adres}?sleutel={voorbeeldSleutel}</code>. Minder veilig (de sleutel staat dan in logboeken), dus gebruik
				het alleen als het anders niet lukt, en trek de sleutel in als je hem niet meer gebruikt.
			</p>
		</section>

		<section class="kaart stapel">
			<h2>Mijn sleutels</h2>
			<ul class="lijst lijstje">
				{#each sleutels as s (s.id)}
					<li class="rij">
						<span class="flex">
							{s.naam ?? 'Sleutel'} <span class="zwak">…{s.staart}</span><br />
							<span class="zwak klein">
								Gemaakt {korteDatum(s.aangemaaktOp)} · {s.laatstGebruiktOp ? `laatst gebruikt ${korteDatum(s.laatstGebruiktOp)}` : 'nog niet gebruikt'}
							</span>
						</span>
						<button class="icoonknop" aria-label="Sleutel intrekken" onclick={() => trekIn(s)}><Trash2 size={18} /></button>
					</li>
				{/each}
				{#if !laden && sleutels.length === 0}<li class="zwak">Nog geen sleutels.</li>{/if}
			</ul>
		</section>
	{/if}
</main>

<style>
	h2.rij {
		gap: 8px;
		margin: 0;
	}
	h2 {
		margin: 0;
	}
	h3 {
		margin: 8px 0 0;
		font-size: 0.9rem;
		color: var(--tekst-zwak);
	}
	p {
		margin: 0;
	}
	.code {
		padding: 10px;
		border-radius: 10px;
		background: var(--kaart-2);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		word-break: break-all;
	}
	code {
		padding: 1px 4px;
		border-radius: 5px;
		background: var(--kaart-2);
		word-break: break-all;
	}
	.stappen {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
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
</style>
