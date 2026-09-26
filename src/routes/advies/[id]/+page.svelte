<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import { CalendarPlus, ChevronLeft, Footprints, Map as KaartIcoon, Play, Star, TriangleAlert, Info } from '@lucide/svelte';
	import type { Advies, Leg, Plek, TreinInfo } from '$lib/types';
	import { zoekAdvies } from '$lib/client/planner.svelte';
	import { data } from '$lib/client/data.svelte';
	import { haalTreinInfo } from '$lib/client/trein';
	import { volgPositie, type Positie } from '$lib/client/gps';
	import { adviesStatus, isOV } from '$lib/reis';
	import { looptijdSeconden } from '$lib/geo';
	import { duurTekst, klok, langeDatum, ms } from '$lib/tijd';
	import { downloadIcs, maakIcs } from '$lib/ics';
	import ReisTijdlijn from '$lib/components/ReisTijdlijn.svelte';
	import StatusLabel from '$lib/components/StatusLabel.svelte';
	import Tijd from '$lib/components/Tijd.svelte';
	import Prijs from '$lib/components/Prijs.svelte';
	import Drukte from '$lib/components/Drukte.svelte';
	import Onderblad from '$lib/components/Onderblad.svelte';
	import VoertuigPaneel from '$lib/components/VoertuigPaneel.svelte';
	import Kaart from '$lib/components/Kaart.svelte';
	import Aftelling from '$lib/components/Aftelling.svelte';

	let { params }: PageProps = $props();
	const gevonden = $derived(zoekAdvies(params.id));
	const advies = $derived<Advies | null>(gevonden?.advies ?? null);
	const van = $derived<Plek | null>(gevonden?.van ?? null);
	const naar = $derived<Plek | null>(gevonden?.naar ?? null);

	// ---------- Treininformatie (kortere trein, drukte) voor NS-legs ----------
	let treinInfo = $state<Record<number, TreinInfo | undefined>>({});
	$effect(() => {
		const a = advies;
		if (!a) return;
		a.legs.forEach((leg, i) => {
			if (!leg.isNS || !leg.ritnummer || ms(leg.aankomst.verwacht) < Date.now()) return;
			haalTreinInfo(leg)
				.then((info) => {
					treinInfo[i] = info;
				})
				.catch(() => {});
		});
	});

	// ---------- Voertuiginfo ----------
	let voertuigLeg = $state<number | null>(null);
	let voertuigOpen = $state(false);
	function toonVoertuig(i: number) {
		voertuigLeg = i;
		voertuigOpen = true;
	}

	// ---------- Kaart ----------
	let kaartOpen = $state(false);
	let kaartLeg = $state(-1);
	function toonKaart(i: number) {
		kaartLeg = i;
		kaartOpen = true;
	}

	// ---------- Nu vertrekken (M6) ----------
	let nuVertrekken = $state(false);
	let positie = $state<Positie | null>(null);
	let gpsFout = $state<string | null>(null);
	let stopGps: (() => void) | undefined;

	$effect(() => {
		if (!nuVertrekken) return;
		untrack(() => {
			gpsFout = null;
			stopGps = volgPositie(
				(p) => (positie = p),
				(f) => (gpsFout = f)
			);
		});
		return () => {
			stopGps?.();
			stopGps = undefined;
		};
	});
	onDestroy(() => stopGps?.());

	const eersteOV = $derived<Leg | undefined>(advies?.legs.find(isOV));
	const looptijd = $derived(
		positie && eersteOV ? looptijdSeconden(positie.lat, positie.lon, eersteOV.van.lat, eersteOV.van.lon) : null
	);
	const vertrekMoment = $derived(
		eersteOV && looptijd !== null ? ms(eersteOV.vertrek.verwacht) - looptijd * 1000 - 60000 : null
	);

	// ---------- Acties ----------
	const favoriet = $derived(van && naar ? data.isFavoriet(van, naar) : undefined);
	async function wisselFavoriet() {
		if (!van || !naar) return;
		if (favoriet) await data.verwijderFavoriet(favoriet.id);
		else await data.zetFavoriet({ van, naar, voorkeur: data.profiel.standaardvoorkeur ?? 'snelst' });
	}

	function agenda() {
		if (!advies || !van || !naar) return;
		downloadIcs(maakIcs(advies, van, naar), `reis-${naar.naam.replace(/[^\w-]+/g, '-').toLowerCase()}.ics`);
	}

	let startBezig = $state(false);
	let startFout = $state<string | null>(null);
	async function start() {
		if (!advies || !van || !naar) return;
		startBezig = true;
		startFout = null;
		try {
			await data.startReis(van, naar, advies);
			goto('/reis');
		} catch (e) {
			startFout = (e as Error).message;
		} finally {
			startBezig = false;
		}
	}
</script>

<svelte:head><title>Reisadvies · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<button class="icoonknop" aria-label="Terug" onclick={() => history.length > 1 ? history.back() : goto('/')}><ChevronLeft size={22} /></button>
		{#if advies}
			<div class="titel">
				<h1 class="klein-kop">{van?.naam} → {naar?.naam}</h1>
				<span class="zwak klein">{langeDatum(advies.vertrek.verwacht)}</span>
			</div>
			<button class="icoonknop" aria-label={favoriet ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'} aria-pressed={!!favoriet} onclick={wisselFavoriet}>
				<Star size={20} fill={favoriet ? 'currentColor' : 'none'} />
			</button>
		{/if}
	</div>

	{#if !advies}
		<div class="kaart stapel">
			<p>Dit reisadvies is niet meer beschikbaar. Plan de reis opnieuw.</p>
			<a class="knop" href="/">Naar de planner</a>
		</div>
	{:else}
		<section class="kaart stapel" aria-label="Samenvatting">
			<div class="rij tussen tijden">
				<div>
					<span class="label">Vertrek</span><br />
					<Tijd tijd={advies.vertrek} groot />
				</div>
				<div class="rechts">
					<span class="label">Aankomst</span><br />
					<Tijd tijd={advies.aankomst} groot />
				</div>
			</div>
			<div class="rij info">
				<StatusLabel status={adviesStatus(advies)} />
				<span>{duurTekst(advies.duur)}</span>
				<span class="zwak">{advies.overstappen === 0 ? 'Direct' : `${advies.overstappen}× overstappen`}</span>
				{#if advies.legs.some((l) => l.isNS) && advies.drukte}<Drukte drukte={advies.drukte} />{/if}
			</div>
			{#if advies.prijs}
				<details>
					<summary class="rij"><span class="zwak">Prijs</span> <Prijs prijs={advies.prijs} /></summary>
					<Prijs prijs={advies.prijs} uitleg />
				</details>
			{/if}
			{#if advies.bron === 'ns'}
				<p class="klein zwak">Gepland via de NS-planner (fallback).</p>
			{/if}
			{#each advies.meldingen ?? [] as m, i (i)}
				<div class="melding {m.ernst === 'ernstig' ? 'fout' : 'waarschuwing'}"><TriangleAlert size={18} /> <span>{m.kop}</span></div>
			{/each}
		</section>

		<section class="kaart stapel" aria-label="Nu vertrekken">
			<label class="rij tussen schakelaar">
				<span class="rij"><Footprints size={20} aria-hidden="true" /> <strong>Nu vertrekken</strong></span>
				<input type="checkbox" role="switch" bind:checked={nuVertrekken} />
			</label>
			{#if nuVertrekken}
				{#if gpsFout}
					<p class="status-fout klein">{gpsFout}</p>
				{:else if !positie}
					<p class="zwak klein">Locatie bepalen…</p>
				{:else if eersteOV && vertrekMoment !== null && looptijd !== null}
					{#if vertrekMoment > Date.now()}
						<div class="aftel">
							<span class="zwak">Vertrek over</span>
							<strong class="groot"><Aftelling doel={vertrekMoment} voorvoegsel="Vertrek" /></strong>
						</div>
						<p class="klein">
							{Math.max(1, Math.round(looptijd / 60))} min lopen naar {eersteOV.van.naam}{eersteOV.van.spoor ? `, spoor ${eersteOV.van.spoor}` : ''}.
							{eersteOV.productNaam ?? 'Rit'} vertrekt om <strong>{klok(eersteOV.vertrek.verwacht)}</strong>.
						</p>
					{:else}
						<div class="melding fout"><TriangleAlert size={18} /> <span>Lopend haal je deze niet meer ({Math.round(looptijd / 60)} min lopen). Kies een latere reis.</span></div>
					{/if}
				{/if}
				<p class="zwak klein">Het vertrekpunt van het advies blijft gelijk; je GPS bepaalt alleen de looptijd.</p>
			{/if}
		</section>

		<div class="rij acties">
			<button class="knop tweede klein" onclick={() => toonKaart(-1)}><KaartIcoon size={18} /> Kaart</button>
			<button class="knop tweede klein" onclick={agenda}><CalendarPlus size={18} /> In agenda</button>
		</div>

		<ReisTijdlijn {advies} {treinInfo} onVoertuig={toonVoertuig} onKaart={toonKaart} />

		<div class="startbalk">
			{#if startFout}<p class="status-fout klein">{startFout}</p>{/if}
			<button class="knop vol groot" onclick={start} disabled={startBezig}>
				<Play size={20} /> {startBezig ? 'Starten…' : 'Start reis'}
			</button>
			{#if data.actieveReis}
				<p class="zwak klein midden"><Info size={14} /> Je huidige actieve reis wordt dan afgesloten.</p>
			{/if}
		</div>
	{/if}
</main>

<Onderblad bind:open={voertuigOpen} titel="Voertuiginfo">
	{#if advies && voertuigLeg !== null}
		<VoertuigPaneel leg={advies.legs[voertuigLeg]} info={treinInfo[voertuigLeg]} />
	{/if}
</Onderblad>

<Onderblad bind:open={kaartOpen} titel="Kaart">
	{#if advies}
		<Kaart {advies} focusLeg={kaartLeg} eigenPositie={positie} hoogte="60dvh" />
	{/if}
</Onderblad>

<style>
	.titel {
		flex: 1;
		min-width: 0;
	}
	.klein-kop {
		font-size: 1.1rem;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rechts {
		text-align: right;
	}
	.info {
		flex-wrap: wrap;
		gap: 6px 14px;
	}
	.schakelaar {
		min-height: 44px;
		cursor: pointer;
	}
	.schakelaar input {
		width: 48px;
		height: 28px;
		accent-color: var(--primair);
	}
	.aftel {
		display: flex;
		flex-direction: column;
	}
	.groot {
		font-size: 2.6rem;
		line-height: 1.1;
	}
	.acties {
		gap: 8px;
		flex-wrap: wrap;
	}
	.startbalk {
		position: sticky;
		bottom: calc(var(--nav-hoogte) + env(safe-area-inset-bottom) + 8px);
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 8px;
	}
	.knop.groot {
		min-height: 56px;
		font-size: 1.05rem;
		box-shadow: 0 6px 20px rgb(0 0 0 / 20%);
	}
	.midden {
		text-align: center;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
	}
	details summary {
		cursor: pointer;
		gap: 8px;
		list-style: none;
		min-height: 32px;
	}
</style>
