<script lang="ts">
	import { onMount } from 'svelte';
	import { Bot, Check, ChevronLeft, Copy, KeyRound, Plus, Trash2, TriangleAlert } from '@lucide/svelte';
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
	const kopWaarde = $derived(`Bearer ${voorbeeldSleutel}`);
	const adresMetSleutel = $derived(`${adres}/${voorbeeldSleutel}`);
	const opdracht = $derived(`claude mcp add --transport http --scope user betterov ${adres} --header "Authorization: Bearer ${voorbeeldSleutel}"`);

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

{#snippet kopieerknop(tekst: string, wat: string, label: string)}
	<button class="knop tweede klein" onclick={() => kopieer(tekst, wat)}>
		{#if gekopieerd === wat}<Check size={18} /> Gekopieerd{:else}<Copy size={18} /> {label}{/if}
	</button>
{/snippet}

<svelte:head><title>AI-assistent · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">AI-assistent</h1>
	</div>

	<section class="kaart stapel">
		<h2 class="rij"><Bot size={20} aria-hidden="true" /> Wat is dit?</h2>
		<p>
			Je kunt een AI-assistent (zoals Claude) aan BetterOV koppelen. Daarna kun je gewoon vragen stellen:
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
				<p class="zwak klein">Houd de sleutel erbij: je hebt hem bij stap 2 nodig en je ziet hem maar één keer.</p>
			{/if}
		</section>

		<section class="kaart stapel">
			<h2>Stap 2: de Claude-app (werkt daarna ook op je telefoon)</h2>
			<p class="klein">
				<strong>Doe dit op een computer of laptop</strong>, in de browser of in de Claude-desktopapp. In de Claude-app op je
				telefoon kun je geen nieuwe connector toevoegen — maar zodra je het hier hebt gedaan, staat BetterOV automatisch ook
				in de app op je telefoon.
			</p>
			<ol class="klein stappen">
				<li>Ga naar <strong>claude.ai</strong> → klik op je naam of profielfoto → <strong>Settings</strong> → <strong>Connectors</strong>.</li>
				<li>Klik op <strong>Add custom connector</strong> (soms eerst op <strong>Add</strong> en dan op <strong>Custom</strong>).</li>
				<li>Naam: <strong>BetterOV</strong>.</li>
				<li>
					URL: dit adres, <strong>zonder</strong> je sleutel erachter.
					<div class="code klein">{adres}</div>
					{@render kopieerknop(adres, 'adres', 'Kopieer adres')}
				</li>
				<li>Bij <strong>Authentication</strong>: kies <strong>No sign-in</strong>. Laat OAuth-velden leeg.</li>
				<li>
					Bij <strong>Request headers</strong>: kies als naam <strong>authorization</strong> (niet iets anders) en vul als waarde in:
					<div class="code klein">{kopWaarde}</div>
					{@render kopieerknop(kopWaarde, 'kop', 'Kopieer waarde')}
				</li>
				<li>Klik <strong>Add</strong>. Onder <em>Your connectors</em> moet BetterOV nu op <strong>Connected</strong> staan.</li>
				<li>In een gesprek gebruiken: open een nieuw gesprek, tik op <strong>+</strong> bij het tekstvak → <strong>Connectors</strong> → zet BetterOV aan. Dat doe je per gesprek, ook op je telefoon.</li>
			</ol>
			<p class="let-op klein">
				<TriangleAlert size={18} aria-hidden="true" />
				<span>
					Zie je bij stap 6 <strong>geen</strong> kopje <em>Request headers</em>? Dan heeft jouw Claude-account die functie nog
					niet (hij wordt stap voor stap uitgerold). Dat is geen fout van jou — probeer dan stap 3.
				</span>
			</p>
		</section>

		<section class="kaart stapel">
			<h2>Stap 3: alleen als stap 2 niet lukt</h2>
			<p class="klein">
				Kan de app je sleutel niet als kop meesturen, dan mag hij ook ín het adres. Vul dan bij <strong>URL</strong> dit in,
				kies <strong>No sign-in</strong> en vul geen koppen in:
			</p>
			<div class="code klein">{adresMetSleutel}</div>
			{@render kopieerknop(adresMetSleutel, 'adres-sleutel', 'Kopieer adres met sleutel')}
			<p class="zwak klein">
				Let op: dit adres is dan net zo geheim als een wachtwoord, want je sleutel zit erin. Het is ook de minst zekere weg —
				Claude raadt sleutels in een adres af en het kan geweigerd worden. Krijg je <em>“Couldn't reach the MCP server”</em>,
				stop dan en laat het mij weten; dan moet er echte login (OAuth) in BetterOV komen.
			</p>
		</section>

		<section class="kaart stapel">
			<h2>Op je laptop in de terminal (werkt zeker)</h2>
			<p class="zwak klein">Gebruik je Claude Code? Dan is dit de simpelste en meest betrouwbare manier — maar alleen op die laptop, niet op je telefoon.</p>
			<div class="code klein">{opdracht}</div>
			{@render kopieerknop(opdracht, 'opdracht', 'Kopieer opdracht')}
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
			<p class="zwak klein">
				Maak je een nieuwe sleutel, dan moet je de connector in Claude verwijderen (de drie puntjes → <em>Remove</em>) en
				opnieuw toevoegen: Claude laat de sleutel van een bestaande connector niet meer wijzigen.
			</p>
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
	p {
		margin: 0;
	}
	.code {
		margin: 6px 0;
		padding: 10px;
		border-radius: 10px;
		background: var(--kaart-2);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		word-break: break-all;
	}
	.stappen {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.let-op {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		padding: 10px;
		border-radius: 10px;
		background: var(--kaart-2);
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
