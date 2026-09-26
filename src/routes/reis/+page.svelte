<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		CalendarPlus,
		CircleX,
		Copy,
		Map as KaartIcoon,
		Navigation,
		RefreshCw,
		Route,
		Share2,
		Square,
		TriangleAlert,
		WifiOff,
		Check,
		Bell
	} from '@lucide/svelte';
	import type { Advies, Probleem, TreinInfo, VoertuigPositie } from '$lib/types';
	import { data } from '$lib/client/data.svelte';
	import { actief } from '$lib/client/actief.svelte';
	import { api } from '$lib/client/api';
	import { haalTreinInfo } from '$lib/client/trein';
	import { volgPositie, type Positie } from '$lib/client/gps';
	import { kiesAlternatief, zoekAlternatieven } from '$lib/client/reisacties';
	import { onthoudAdvies } from '$lib/client/planner.svelte';
	import { pushStatus } from '$lib/client/push';
	import { huidigeStap, isOV } from '$lib/reis';
	import { klok, ms, relatief } from '$lib/tijd';
	import { geschattePositie } from '$lib/voertuig';
	import { downloadIcs, maakIcs } from '$lib/ics';
	import ReisTijdlijn from '$lib/components/ReisTijdlijn.svelte';
	import Aftelling from '$lib/components/Aftelling.svelte';
	import AdviesKaart from '$lib/components/AdviesKaart.svelte';
	import Onderblad from '$lib/components/Onderblad.svelte';
	import VoertuigPaneel from '$lib/components/VoertuigPaneel.svelte';
	import Kaart from '$lib/components/Kaart.svelte';

	const reis = $derived(data.actieveReis);

	// Klok voor de huidige stap
	let nu = $state(Date.now());
	const klokTimer = setInterval(() => (nu = Date.now()), 5000);
	onDestroy(() => clearInterval(klokTimer));

	const stap = $derived(reis ? huidigeStap(reis.advies, nu) : null);
	const problemen = $derived<Probleem[]>(reis?.problemen ?? []);
	const ernstig = $derived(problemen.filter((p) => p.ernstig));

	// ---------- Treininformatie ----------
	let treinInfo = $state<Record<number, TreinInfo | undefined>>({});
	let treinVoor = '';
	$effect(() => {
		const a = reis?.advies;
		if (!a || a.id === treinVoor) return;
		treinVoor = a.id;
		treinInfo = {};
		a.legs.forEach((leg, i) => {
			if (!leg.isNS || !leg.ritnummer || ms(leg.aankomst.verwacht) < Date.now()) return;
			haalTreinInfo(leg)
				.then((info) => (treinInfo[i] = info))
				.catch(() => {});
		});
	});

	// ---------- Alternatieven (M8) ----------
	let alternatieven = $state<{ adviezen: Advies[]; vanafLeg: number; vanNaam: string; melding?: string } | null>(null);
	let altBezig = $state(false);
	let altFout = $state<string | null>(null);
	let altVoor = '';

	async function laadAlternatieven(p: Probleem | null) {
		if (!reis) return;
		altBezig = true;
		altFout = null;
		try {
			const r = await zoekAlternatieven(reis, p);
			for (const a of r.adviezen) onthoudAdvies(a, r.van, reis.naar);
			alternatieven = { adviezen: r.adviezen, vanafLeg: r.vanafLeg, vanNaam: r.van.naam, melding: r.melding };
		} catch (e) {
			altFout = (e as Error).message;
		} finally {
			altBezig = false;
		}
	}

	// Bij een ernstig probleem meteen alternatieven zoeken
	$effect(() => {
		const p = ernstig[0];
		if (!p || !reis) return;
		const sleutel = `${reis.id}:${p.sleutel}`;
		if (sleutel === altVoor) return;
		altVoor = sleutel;
		void laadAlternatieven(p);
	});

	async function kies(a: Advies) {
		if (!reis || !alternatieven) return;
		await kiesAlternatief(reis, a, alternatieven.vanafLeg);
		alternatieven = null;
		altVoor = '';
		void actief.ververs();
	}

	// ---------- Kaart en live positie (M10) ----------
	let kaartOpen = $state(false);
	let kaartLeg = $state(-1);
	let mijnPositie = $state<Positie | null>(null);
	let voertuig = $state<(VoertuigPositie & { label?: string }) | null>(null);
	let stopGps: (() => void) | undefined;
	let voertuigTimer: ReturnType<typeof setInterval> | undefined;

	async function werkVoertuigBij() {
		if (!reis || !stap) return;
		const legIndex = kaartLeg >= 0 ? kaartLeg : stap.legIndex;
		const leg = reis.advies.legs[legIndex];
		if (!leg || !isOV(leg)) {
			voertuig = null;
			return;
		}
		if (leg.isNS && leg.ritnummer) {
			const gps = await api<VoertuigPositie | null>(`/api/voertuig?ritnummer=${leg.ritnummer}`).catch(() => null);
			if (gps) {
				voertuig = gps;
				return;
			}
		}
		voertuig = geschattePositie(leg);
	}

	$effect(() => {
		if (kaartOpen) {
			stopGps = volgPositie((p) => (mijnPositie = p));
			void werkVoertuigBij();
			voertuigTimer = setInterval(() => void werkVoertuigBij(), 15000);
		} else {
			stopGps?.();
			clearInterval(voertuigTimer);
		}
		return () => {
			stopGps?.();
			clearInterval(voertuigTimer);
		};
	});

	function toonKaart(i: number) {
		kaartLeg = i;
		kaartOpen = true;
	}

	// ---------- Voertuiginfo ----------
	let voertuigLeg = $state<number | null>(null);
	let voertuigOpen = $state(false);

	// ---------- Delen (M21) ----------
	let deelOpen = $state(false);
	let deelBezig = $state(false);
	let deelFout = $state<string | null>(null);
	let gekopieerd = $state(false);
	const deelLink = $derived(reis?.gedeeldId ? `${location.origin}/gedeeld/${reis.gedeeldId}` : null);

	async function deel() {
		if (!reis) return;
		deelBezig = true;
		deelFout = null;
		try {
			const id = await data.deelReis(reis);
			actief.synchroniseerLocatieDelen();
			const link = `${location.origin}/gedeeld/${id}`;
			if (navigator.share) {
				await navigator.share({ title: 'Volg mijn reis', text: `Volg mijn reis naar ${reis.naar.naam}`, url: link }).catch(() => {});
			}
			deelOpen = true;
		} catch (e) {
			deelFout = (e as Error).message;
			deelOpen = true;
		} finally {
			deelBezig = false;
		}
	}

	async function kopieer() {
		if (!deelLink) return;
		await navigator.clipboard.writeText(deelLink).catch(() => {});
		gekopieerd = true;
		setTimeout(() => (gekopieerd = false), 2000);
	}

	async function stopDelen() {
		if (!reis) return;
		await data.stopDelen(reis);
		actief.synchroniseerLocatieDelen();
		deelOpen = false;
	}

	// ---------- Beëindigen ----------
	let stopOpen = $state(false);
	async function beeindig() {
		if (!reis) return;
		await data.beeindigReis(reis);
		stopOpen = false;
		goto('/');
	}

	function agenda() {
		if (!reis) return;
		downloadIcs(maakIcs(reis.advies, reis.van, reis.naar), 'reis.ics');
	}

	const pushUit = $derived(typeof window !== 'undefined' && pushStatus() !== 'aan');
</script>

<svelte:head><title>Reis · BetterOV</title></svelte:head>

<main class="pagina stapel">
	{#if !reis}
		<h1>Reis</h1>
		<div class="kaart stapel leeg">
			<Navigation size={32} aria-hidden="true" />
			<p>Je hebt geen actieve reis. Plan een reis en tik op <strong>Start reis</strong>; dan bewaakt de app je reis en waarschuwt als er iets misgaat.</p>
			<a class="knop" href="/"><Route size={18} /> Reis plannen</a>
		</div>
	{:else}
		<header class="stapel kop">
			<span class="zwak klein">Onderweg naar</span>
			<h1>{reis.naar.naam}</h1>
		</header>

		{#if stap}
			<section class="kaart volgende" class:klaar={stap.fase === 'klaar'} aria-live="polite">
				<span class="label">{stap.fase === 'voor' ? 'Volgende stap' : stap.fase === 'tijdens' ? 'Nu' : 'Klaar'}</span>
				<h2 class="stap-titel">{stap.titel}</h2>
				<p class="stap-detail">{stap.detail}</p>
				{#if stap.fase !== 'klaar'}
					<div class="aftel">
						<span class="zwak">{stap.fase === 'voor' ? 'Over' : 'Nog'}</span>
						<strong class="groot"><Aftelling doel={ms(stap.doel)} voorvoegsel={stap.titel} /></strong>
					</div>
				{:else}
					<button class="knop" onclick={beeindig}><Check size={18} /> Reis afronden</button>
				{/if}
			</section>
		{/if}

		{#each problemen as p (p.sleutel)}
			<div class="melding {p.ernstig ? 'fout' : 'waarschuwing'}" role="alert">
				{#if p.soort === 'uitval'}<CircleX size={20} />{:else}<TriangleAlert size={20} />{/if}
				<span>{p.tekst}</span>
			</div>
		{/each}

		{#if ernstig.length > 0 || alternatieven}
			<section class="stapel" aria-labelledby="alt-kop">
				<div class="rij tussen">
					<h2 id="alt-kop">Alternatieven{alternatieven ? ` vanaf ${alternatieven.vanNaam}` : ''}</h2>
					<button class="icoonknop" aria-label="Alternatieven opnieuw zoeken" onclick={() => laadAlternatieven(ernstig[0] ?? null)} disabled={altBezig}><RefreshCw size={18} /></button>
				</div>
				{#if altBezig}
					<p class="zwak">Alternatieven zoeken…</p>
				{:else if altFout}
					<div class="melding fout"><TriangleAlert size={18} /> <span>{altFout}</span></div>
				{:else if alternatieven}
					{#if alternatieven.melding}<p class="zwak klein">{alternatieven.melding}</p>{/if}
					{#each alternatieven.adviezen.slice(0, 4) as a (a.id)}
						<div class="stapel alt">
							<AdviesKaart advies={a} href="/advies/{a.id}" />
							<button class="knop klein" onclick={() => kies(a)}>Kies dit alternatief</button>
						</div>
					{:else}
						<p class="zwak">Geen alternatieven gevonden.</p>
					{/each}
				{/if}
			</section>
		{/if}

		<div class="rij acties">
			<button class="knop tweede klein" onclick={() => toonKaart(-1)}><KaartIcoon size={18} /> Live kaart</button>
			<button class="knop tweede klein" onclick={deel} disabled={deelBezig}><Share2 size={18} /> {reis.gedeeldId ? 'Gedeeld' : 'Deel live'}</button>
			{#if ernstig.length === 0 && !alternatieven}
				<button class="knop tweede klein" onclick={() => laadAlternatieven(null)}><Route size={18} /> Andere opties</button>
			{/if}
			<button class="knop tweede klein" onclick={agenda}><CalendarPlus size={18} /> Agenda</button>
		</div>

		<ReisTijdlijn
			advies={reis.advies}
			{treinInfo}
			actieveLeg={stap?.fase !== 'klaar' ? (stap?.legIndex ?? -1) : -1}
			onVoertuig={(i) => {
				voertuigLeg = i;
				voertuigOpen = true;
			}}
			onKaart={toonKaart}
		/>

		<div class="rij tussen status klein">
			<span class:status-vertraagd={actief.uitCache}>
				{#if actief.uitCache}<WifiOff size={14} aria-hidden="true" />{/if}
				{#if actief.opgehaaldOp}
					Bijgewerkt {klok(actief.opgehaaldOp)} ({relatief(actief.opgehaaldOp, nu)})
				{:else if reis.laatstBijgewerkt}
					Laatst bijgewerkt {klok(reis.laatstBijgewerkt)}
				{/if}
			</span>
			<button class="knop tweede klein" onclick={() => actief.ververs()} disabled={actief.bezig}>
				<RefreshCw size={16} /> {actief.bezig ? 'Bezig…' : 'Ververs'}
			</button>
		</div>
		{#if actief.fout && !actief.uitCache}<p class="status-fout klein">{actief.fout}</p>{/if}

		{#if pushUit}
			<a class="melding info klein" href="/instellingen"><Bell size={16} /> <span>Zet meldingen aan om ook gewaarschuwd te worden als de app dicht is.</span></a>
		{/if}

		<button class="knop gevaar" onclick={() => (stopOpen = true)}><Square size={16} /> Reis beëindigen</button>
	{/if}
</main>

<Onderblad bind:open={kaartOpen} titel="Live positie">
	{#if reis}
		<Kaart advies={reis.advies} focusLeg={kaartLeg} eigenPositie={mijnPositie} {voertuig} hoogte="62dvh" />
		<p class="klein zwak">
			Blauw: jij{voertuig ? (voertuig.soort === 'gps' ? ' · geel: de trein (GPS)' : ' · geel: geschatte positie van het voertuig') : ''}.
		</p>
	{/if}
</Onderblad>

<Onderblad bind:open={voertuigOpen} titel="Voertuiginfo">
	{#if reis && voertuigLeg !== null}
		<VoertuigPaneel leg={reis.advies.legs[voertuigLeg]} info={treinInfo[voertuigLeg]} />
	{/if}
</Onderblad>

<Onderblad bind:open={deelOpen} titel="Reis live delen">
	{#if deelFout}
		<div class="melding fout"><TriangleAlert size={18} /> <span>{deelFout}</span></div>
	{:else if deelLink}
		<div class="stapel">
			<p>Iedereen met deze link ziet je reis en je laatste locatie, zonder in te loggen. De link verloopt twee uur na aankomst.</p>
			<div class="link klein">{deelLink}</div>
			<button class="knop" onclick={kopieer}><Copy size={18} /> {gekopieerd ? 'Gekopieerd' : 'Kopieer link'}</button>
			<p class="zwak klein">Je locatie wordt hooguit elke minuut bijgewerkt en alleen zolang de app open is.</p>
			<button class="knop gevaar" onclick={stopDelen}>Stop met delen</button>
		</div>
	{/if}
</Onderblad>

<Onderblad bind:open={stopOpen} titel="Reis beëindigen?">
	<p>De reis verdwijnt uit je actieve reis en komt in je reisoverzicht.</p>
	<div class="rij" style="gap: 8px">
		<button class="knop tweede" onclick={() => (stopOpen = false)}>Annuleren</button>
		<button class="knop gevaar" onclick={beeindig}>Beëindigen</button>
	</div>
</Onderblad>

<style>
	.kop {
		gap: 0;
	}
	.kop h1 {
		margin: 0;
	}
	.volgende {
		border: 2px solid var(--primair);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.volgende.klaar {
		border-color: var(--ok);
	}
	.stap-titel {
		font-size: 1.3rem;
		margin: 0;
	}
	.stap-detail {
		margin: 0;
		font-size: 1.05rem;
	}
	.aftel {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 4px;
	}
	.groot {
		font-size: 2.8rem;
		line-height: 1.05;
		letter-spacing: -0.02em;
	}
	.acties {
		gap: 8px;
		flex-wrap: wrap;
	}
	.status {
		gap: 8px;
		flex-wrap: wrap;
	}
	.status span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.alt {
		gap: 6px;
	}
	.leeg {
		align-items: flex-start;
	}
	.leeg p {
		margin: 0;
	}
	.link {
		padding: 10px;
		border-radius: 10px;
		background: var(--kaart-2);
		word-break: break-all;
	}
	a.melding {
		text-decoration: none;
	}
</style>
