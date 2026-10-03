<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		CalendarPlus,
		ChevronDown,
		CircleX,
		Copy,
		Gauge,
		LocateFixed,
		Maximize2,
		Minimize2,
		Navigation,
		RefreshCw,
		Route,
		Share2,
		Square,
		TriangleAlert,
		WifiOff,
		Check,
		Bell,
		Split
	} from '@lucide/svelte';
	import type { Advies, Probleem, TreinInfo, VoertuigPositie } from '$lib/types';
	import { data } from '$lib/client/data.svelte';
	import { actief } from '$lib/client/actief.svelte';
	import { api } from '$lib/client/api';
	import { haalTreinInfo } from '$lib/client/trein';
	import { locatieToegestaan, volgPositie, type Positie } from '$lib/client/gps';
	import { zoekAlternatieven } from '$lib/client/reisacties';
	import { onthoudAdvies } from '$lib/client/planner.svelte';
	import { pushStatus } from '$lib/client/push';
	import { huidigeStap, isOV } from '$lib/reis';
	import { splitsTekst } from '$lib/splitsen';
	import { klok, ms, relatief } from '$lib/tijd';
	import { voertuigPositie } from '$lib/client/voertuigpositie';
	import { downloadIcs, maakIcs } from '$lib/ics';
	import ReisTijdlijn from '$lib/components/ReisTijdlijn.svelte';
	import Aftelling from '$lib/components/Aftelling.svelte';
	import AdviesKaart from '$lib/components/AdviesKaart.svelte';
	import LegOverzicht from '$lib/components/LegOverzicht.svelte';
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
				.then((info) => {
					treinInfo[i] = info;
				})
				.catch(() => {});
		});
	});

	// Splitst de trein van deze stap onderweg? Dan meteen zeggen in welk deel je moet zitten
	const stapSplits = $derived(stap && stap.fase !== 'klaar' ? splitsTekst(treinInfo[stap.legIndex]) : null);

	// ---------- Alternatieven (M8) ----------
	let alternatieven = $state<{ adviezen: Advies[]; vanafLeg: number; vanNaam: string; melding?: string } | null>(null);
	let altBezig = $state(false);
	let altFout = $state<string | null>(null);
	let altOpen = $state(true);
	let altVoor = '';

	async function laadAlternatieven(p: Probleem | null) {
		if (!reis) return;
		altBezig = true;
		altOpen = true;
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
		untrack(() => void laadAlternatieven(p));
	});

	// ---------- Kaart, live positie en snelheid ----------
	// De kaart staat altijd klein in de pagina; met de knop (of een tik) wordt hij schermvullend.
	let kaartGroot = $state(false);
	let kaartLeg = $state(-1);
	let mijnPositie = $state<Positie | null>(null);
	let voertuig = $state<(VoertuigPositie & { label?: string }) | null>(null);
	let gpsAan = $state(false);
	let gpsFout = $state<string | null>(null);

	const huidigeLeg = $derived(reis && stap && stap.fase !== 'klaar' ? reis.advies.legs[stap.legIndex] : undefined);
	const inVoertuig = $derived(!!huidigeLeg && stap?.fase === 'tijdens' && isOV(huidigeLeg));
	// Klein kaartje: tijdens een rit die rit, anders de hele reis
	const kleineFocus = $derived(inVoertuig && stap ? stap.legIndex : -1);

	async function werkVoertuigBij() {
		if (!reis || !stap) return;
		const legIndex = kaartLeg >= 0 ? kaartLeg : stap.legIndex;
		voertuig = await voertuigPositie(reis.advies.legs[legIndex]);
	}

	// Locatie alleen vanzelf als de app hem al mag gebruiken; anders pas na een tik
	locatieToegestaan().then((ja) => {
		if (ja) gpsAan = true;
	});

	$effect(() => {
		if (!gpsAan) return;
		const stop = untrack(() =>
			volgPositie(
				(p) => {
					mijnPositie = p;
					gpsFout = null;
				},
				(f) => (gpsFout = f)
			)
		);
		return stop;
	});

	const heeftReis = $derived(!!reis);
	$effect(() => {
		if (!heeftReis) return;
		untrack(() => void werkVoertuigBij());
		const timer = setInterval(() => void werkVoertuigBij(), 15000);
		return () => clearInterval(timer);
	});

	function toonKaart(i: number) {
		kaartLeg = i;
		kaartGroot = true;
		void werkVoertuigBij();
	}

	function sluitKaart() {
		kaartGroot = false;
		kaartLeg = -1;
	}

	// Snelheid tijdens een rit: GPS van je telefoon, anders die van de trein (NS)
	const snelheid = $derived.by((): { kmu: number; bron: 'telefoon' | 'trein' } | null => {
		if (!inVoertuig) return null;
		if (mijnPositie?.kmu !== undefined && nu - mijnPositie.tijd < 20000) return { kmu: mijnPositie.kmu, bron: 'telefoon' };
		if (voertuig?.soort === 'gps' && voertuig.snelheid !== undefined) return { kmu: voertuig.snelheid, bron: 'trein' };
		return null;
	});

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
			<Navigation size={28} aria-hidden="true" />
			<p>Geen actieve reis. Start een reis vanuit een reisadvies; dan bewaakt de app hem en waarschuwt als er iets misgaat.</p>
			<a class="knop" href="/"><Route size={18} /> Reis plannen</a>
		</div>
	{:else}
		<header class="kop">
			<h1>Naar {reis.naar.naam}</h1>
			<div class="rij tussen samenvatting">
				<LegOverzicht advies={reis.advies} />
				<span class="zwak klein getal tijden">{klok(reis.advies.vertrek.verwacht)} – {klok(reis.advies.aankomst.verwacht)}</span>
			</div>
		</header>

		{#if stap}
			<section class="kaart volgende" class:klaar={stap.fase === 'klaar'} aria-live="polite">
				<span class="label">{stap.fase === 'voor' ? 'Volgende stap' : stap.fase === 'tijdens' ? 'Nu' : 'Klaar'}</span>
				<h2 class="stap-titel">{stap.titel}</h2>
				<p class="stap-detail">{stap.detail}</p>
				{#if stapSplits}
					<p class="rij stap-splits"><Split size={16} aria-hidden="true" /> <span>{stapSplits.kort}</span></p>
				{/if}
				{#if inVoertuig}
					{#if snelheid}
						<p class="rij snelheid" aria-live="off">
							<Gauge size={16} aria-hidden="true" />
							<span><strong class="getal">{Math.round(snelheid.kmu)}</strong> km/u</span>
							{#if snelheid.bron === 'trein'}<span class="zwak klein">(GPS van de trein)</span>{/if}
						</p>
					{:else if gpsAan}
						<p class="rij snelheid zwak"><Gauge size={16} aria-hidden="true" /> <span>– km/u</span></p>
					{:else}
						<button type="button" class="tekstknop snelheidknop" onclick={() => (gpsAan = true)}><Gauge size={16} /> Toon snelheid</button>
					{/if}
				{/if}
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
				{#if p.soort === 'uitval'}<CircleX size={18} />{:else}<TriangleAlert size={18} />{/if}
				<span>{p.tekst}</span>
			</div>
		{/each}

		{#if ernstig.length > 0 || alternatieven || altBezig}
			<section class="stapel" aria-labelledby="alt-kop">
				<div class="rij tussen">
					<button type="button" class="altkop" aria-expanded={altOpen} aria-controls="alt-lijst" onclick={() => (altOpen = !altOpen)}>
						<h2 id="alt-kop">Alternatieven{alternatieven ? ` vanaf ${alternatieven.vanNaam}` : ''}</h2>
						<ChevronDown size={18} aria-hidden="true" style="transform: rotate({altOpen ? 180 : 0}deg)" />
					</button>
					<button class="icoonknop" aria-label="Alternatieven opnieuw zoeken" onclick={() => laadAlternatieven(ernstig[0] ?? null)} disabled={altBezig}><RefreshCw size={18} /></button>
				</div>
				{#if altOpen}
					<div class="stapel" id="alt-lijst">
						{#if altBezig}
							<p class="zwak">Alternatieven zoeken…</p>
						{:else if altFout}
							<div class="melding fout"><TriangleAlert size={18} /> <span>{altFout}</span></div>
						{:else if alternatieven}
							{#if alternatieven.melding}<p class="zwak klein">{alternatieven.melding}</p>{/if}
							{#each alternatieven.adviezen.slice(0, 4) as a (a.id)}
								<AdviesKaart advies={a} href="/advies/{a.id}?alternatief={alternatieven.vanafLeg}" />
							{:else}
								<p class="zwak">Geen alternatieven gevonden.</p>
							{/each}
						{/if}
					</div>
				{/if}
			</section>
		{/if}

		<div class="actiebalk">
			<button onclick={deel} disabled={deelBezig}><Share2 size={18} /> {reis.gedeeldId ? 'Gedeeld' : 'Deel live'}</button>
			{#if ernstig.length === 0 && !alternatieven && !altBezig}
				<button onclick={() => laadAlternatieven(null)}><Route size={18} /> Andere opties</button>
			{/if}
			<button onclick={agenda}><CalendarPlus size={18} /> Agenda</button>
		</div>

		{#if !kaartGroot}
			<div class="kaartvak-klein">
				<Kaart advies={reis.advies} focusLeg={kleineFocus} eigenPositie={mijnPositie} {voertuig} hoogte="190px" compact onKlik={() => toonKaart(-1)} />
				<button type="button" class="kaartknop vergroot" aria-label="Kaart schermvullend" onclick={() => toonKaart(-1)}><Maximize2 size={18} /></button>
				{#if !gpsAan}
					<button type="button" class="kaartknop locatie" aria-label="Toon mijn locatie" onclick={() => (gpsAan = true)}><LocateFixed size={18} /></button>
				{/if}
			</div>
		{/if}
		{#if gpsFout && gpsAan}<p class="status-fout klein">{gpsFout}</p>{/if}

		<ReisTijdlijn
			advies={reis.advies}
			{treinInfo}
			{nu}
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
					Bijgewerkt {klok(reis.laatstBijgewerkt)}
				{/if}
			</span>
			<button class="icoonknop klein-knop" aria-label="Verversen" onclick={() => actief.ververs()} disabled={actief.bezig}>
				<RefreshCw size={16} class={actief.bezig ? 'draai' : ''} />
			</button>
		</div>
		{#if actief.fout && !actief.uitCache}<p class="status-fout klein">{actief.fout}</p>{/if}

		{#if pushUit}
			<a class="melding info klein" href="/instellingen"><Bell size={16} /> <span>Zet meldingen aan, dan waarschuwt de app ook als hij dicht is.</span></a>
		{/if}

		<button class="tekstknop stopknop" onclick={() => (stopOpen = true)}><Square size={14} /> Reis beëindigen</button>
	{/if}
</main>

{#if reis && kaartGroot}
	<div class="kaart-volledig" role="dialog" aria-modal="true" aria-label="Live kaart">
		<Kaart advies={reis.advies} focusLeg={kaartLeg} eigenPositie={mijnPositie} {voertuig} hoogte="100%" />
		<button type="button" class="kaartknop sluit" aria-label="Kaart verkleinen" onclick={sluitKaart}><Minimize2 size={20} /></button>
		<p class="legenda klein">
			{mijnPositie ? 'Blauw: jij' : 'Je eigen locatie staat uit'}{voertuig ? (voertuig.soort === 'gps' ? ' · geel: de trein (GPS)' : ' · geel: geschatte positie van het voertuig') : ''}
			{#if !gpsAan}· <button type="button" class="tekstknop" onclick={() => (gpsAan = true)}>Locatie aanzetten</button>{/if}
		</p>
	</div>
{/if}

<svelte:window onkeydown={(e) => kaartGroot && e.key === 'Escape' && sluitKaart()} />

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
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.kop h1 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.samenvatting {
		gap: 8px;
		align-items: center;
	}
	.tijden {
		white-space: nowrap;
	}
	.snelheid {
		margin: 2px 0 0;
		gap: 6px;
		align-items: center;
	}
	.snelheid strong {
		font-size: 1.15rem;
	}
	.snelheidknop {
		align-self: flex-start;
		margin-top: 2px;
	}
	.altkop {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--tekst);
		font: inherit;
		cursor: pointer;
		text-align: left;
		min-width: 0;
	}
	.altkop h2 {
		margin: 0;
	}
	.kaartvak-klein {
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
	.kaart-volledig {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
	}
	.kaart-volledig > :global(.kaartvak) {
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
	.volgende {
		border: 2px solid var(--primair);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.volgende.klaar {
		border-color: var(--ok);
	}
	.stap-titel {
		font-size: 1.2rem;
		margin: 0;
	}
	.stap-detail {
		margin: 0;
	}
	.stap-splits {
		margin: 0;
		gap: 6px;
		font-weight: 600;
	}
	.aftel {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 2px;
	}
	.groot {
		font-size: 2.4rem;
		line-height: 1.05;
		letter-spacing: -0.02em;
	}
	.status {
		gap: 8px;
		color: var(--tekst-zwak);
	}
	.status span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.klein-knop {
		width: 36px;
		height: 36px;
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
	.stopknop {
		align-self: center;
		color: var(--fout);
	}
	:global(.draai) {
		animation: draai 1s linear infinite;
	}
	@keyframes draai {
		to {
			transform: rotate(360deg);
		}
	}
</style>
