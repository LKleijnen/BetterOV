<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowUpDown, CalendarDays, ChevronRight, Clock, House, Info, Navigation, Pencil, Play, Search, Star, TriangleAlert, X } from '@lucide/svelte';
	import type { Voorkeur, WeekItem } from '$lib/types';
	import { onthoudAdvies, planner, VOORKEUR_LABELS } from '$lib/client/planner.svelte';
	import { data } from '$lib/client/data.svelte';
	import { sessie } from '$lib/client/sessie.svelte';
	import { laatsteNaarHuis, startVasteReis, type LaatsteAntwoord } from '$lib/client/reisacties';
	import { klok, korteDatum, nlDatumTijd, nlOnderdelen, nlDatum, nlTijd, duurTekst } from '$lib/tijd';
	import PlekInvoer from '$lib/components/PlekInvoer.svelte';
	import AdviesKaart from '$lib/components/AdviesKaart.svelte';
	import Onderblad from '$lib/components/Onderblad.svelte';

	const voorkeuren: Voorkeur[] = ['snelst', 'overstappen', 'goedkoopst', 'drukte'];

	let toonVia = $state(!!planner.via);
	let formulierOpen = $state(planner.adviezen.length === 0);
	let resultatenEl = $state<HTMLElement>();

	$effect(() => {
		// Standaardvoorkeur uit het profiel gebruiken zolang er nog niet gezocht is
		if (!planner.gezocht && data.profiel.standaardvoorkeur) planner.voorkeur = data.profiel.standaardvoorkeur;
	});

	async function plan() {
		await planner.zoek();
		if (planner.adviezen.length > 0) {
			formulierOpen = false;
			resultatenEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function momentSoort(soort: 'nu' | 'vertrek' | 'aankomst') {
		if (soort === 'nu') {
			planner.nu = true;
			planner.aankomst = false;
			return;
		}
		if (planner.nu) {
			planner.datum = nlDatum();
			planner.tijd = nlTijd();
		}
		planner.nu = false;
		planner.aankomst = soort === 'aankomst';
	}

	const momentTekst = $derived(
		planner.nu
			? 'Nu vertrekken'
			: `${planner.aankomst ? 'Aankomst' : 'Vertrek'} ${planner.datum === nlDatum() ? 'vandaag' : korteDatum(nlDatumTijd(planner.datum, '12:00').toISOString())} ${planner.tijd}`
	);

	// ---------- Naar huis (laatste verbinding) ----------
	let huisOpen = $state(false);
	let huisBezig = $state(false);
	let huis = $state<LaatsteAntwoord | null>(null);
	let huisFout = $state<string | null>(null);

	async function naarHuis() {
		huisOpen = true;
		huisBezig = true;
		huisFout = null;
		huis = null;
		try {
			huis = await laatsteNaarHuis();
			if (huis.advies) onthoudAdvies(huis.advies, huis.van, huis.naar);
		} catch (e) {
			huisFout = (e as Error).message;
		} finally {
			huisBezig = false;
		}
	}

	// ---------- Vaste reizen vandaag ----------
	const vandaag = $derived.by(() => {
		const o = nlOnderdelen(new Date());
		const nuMin = o.uur * 60 + o.minuut;
		return data.weekplanning
			.filter((w) => w.dagen.includes(o.weekdag))
			.filter((w) => {
				const [u, m] = w.tijd.split(':').map(Number);
				return u * 60 + m >= nuMin - 30;
			})
			.sort((a, b) => a.tijd.localeCompare(b.tijd));
	});
	let vasteBezig = $state<string | null>(null);
	let vasteFout = $state<string | null>(null);

	async function startVast(w: WeekItem) {
		vasteBezig = w.id;
		vasteFout = null;
		try {
			const reis = await startVasteReis(w);
			if (reis) goto('/reis');
			else vasteFout = 'Geen reis gevonden voor deze vaste reis.';
		} catch (e) {
			vasteFout = (e as Error).message;
		} finally {
			vasteBezig = null;
		}
	}

	function bekijkVast(w: WeekItem) {
		planner.zetReis(w.van, w.naar, w.via ?? null);
		planner.zetMoment(nlDatum(), w.tijd, w.soort === 'aankomst');
		void plan();
	}

	const favoriet = $derived(planner.van && planner.naar ? data.isFavoriet(planner.van, planner.naar) : undefined);
	async function wisselFavoriet() {
		if (!planner.van || !planner.naar) return;
		if (favoriet) await data.verwijderFavoriet(favoriet.id);
		else await data.zetFavoriet({ van: planner.van, naar: planner.naar, via: planner.via ?? undefined, voorkeur: planner.voorkeur });
	}

	const toonDrukteKeuze = $derived(!planner.gezocht || planner.drukteBeschikbaar || planner.voorkeur === 'drukte');
</script>

<svelte:head><title>Plannen · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<header class="rij tussen">
		<h1>{sessie.voornaam ? `Hoi ${sessie.voornaam}` : 'Waar wil je heen?'}</h1>
	</header>

	{#if data.actieveReis}
		<a class="kaart actieve-reis rij" href="/reis">
			<Navigation size={22} aria-hidden="true" />
			<span>
				<strong>Je bent onderweg naar {data.actieveReis.naar.naam}</strong><br />
				<span class="zwak klein">Aankomst {klok(data.actieveReis.advies.aankomst.verwacht)}</span>
			</span>
			<ChevronRight size={20} aria-hidden="true" />
		</a>
	{/if}

	{#if sessie.demo}
		<div class="melding info klein">
			<Info size={18} />
			<span>Demo-modus: je gegevens staan alleen op dit apparaat. Na het koppelen van Firebase log je in met Google en synchroniseert alles.</span>
		</div>
	{/if}

	{#if formulierOpen || planner.adviezen.length === 0}
		<form class="kaart stapel" onsubmit={(e) => (e.preventDefault(), plan())}>
			<div class="van-naar">
				<div class="stapel">
					<PlekInvoer label="Van" bind:waarde={planner.van} />
					<PlekInvoer label="Naar" bind:waarde={planner.naar} />
				</div>
				<button type="button" class="icoonknop wissel" aria-label="Van en naar omwisselen" onclick={() => planner.wissel()}>
					<ArrowUpDown size={20} />
				</button>
			</div>

			{#if toonVia}
				<PlekInvoer label="Via (halte of station)" bind:waarde={planner.via} alleenHaltes gps={false} wisbaar />
			{:else}
				<button type="button" class="linkknop klein" onclick={() => (toonVia = true)}>+ Via-station toevoegen</button>
			{/if}

			<div class="stapel moment">
				<div class="chips" role="group" aria-label="Wanneer">
					<button type="button" class="chip" aria-pressed={planner.nu} onclick={() => momentSoort('nu')}>Nu</button>
					<button type="button" class="chip" aria-pressed={!planner.nu && !planner.aankomst} onclick={() => momentSoort('vertrek')}>Vertrek</button>
					<button type="button" class="chip" aria-pressed={!planner.nu && planner.aankomst} onclick={() => momentSoort('aankomst')}>Aankomst</button>
				</div>
				{#if !planner.nu}
					<div class="rij datumtijd">
						<label class="stapel veldlabel">
							<span class="label">Datum</span>
							<input class="veld" type="date" bind:value={planner.datum} required />
						</label>
						<label class="stapel veldlabel">
							<span class="label">Tijd</span>
							<input class="veld" type="time" bind:value={planner.tijd} required />
						</label>
					</div>
				{/if}
			</div>

			<div class="stapel">
				<span class="label">Voorkeur</span>
				<div class="chips" role="group" aria-label="Voorkeur">
					{#each voorkeuren as v (v)}
						{#if v !== 'drukte' || toonDrukteKeuze}
							<button type="button" class="chip" aria-pressed={planner.voorkeur === v} onclick={() => (planner.voorkeur = v)}>{VOORKEUR_LABELS[v]}</button>
						{/if}
					{/each}
				</div>
			</div>

			<button class="knop vol" type="submit" disabled={planner.laden === 'nieuw'}>
				<Search size={20} /> {planner.laden === 'nieuw' ? 'Zoeken…' : 'Plan reis'}
			</button>
			{#if planner.fout && planner.adviezen.length === 0}
				<div class="melding fout" role="alert"><TriangleAlert size={18} /> <span>{planner.fout}</span></div>
			{/if}
		</form>

		{#if planner.adviezen.length === 0}
			<section class="stapel">
				<button class="kaart snelknop rij" onclick={naarHuis}>
					<House size={22} aria-hidden="true" />
					<span><strong>Laatste verbinding naar huis</strong><br /><span class="zwak klein">Vanaf je huidige locatie</span></span>
					<ChevronRight size={20} aria-hidden="true" />
				</button>

				{#if vandaag.length > 0}
					<div class="kaart stapel">
						<h2 class="rij"><CalendarDays size={20} aria-hidden="true" /> Vaste reizen vandaag</h2>
						{#each vandaag as w (w.id)}
							<div class="rij tussen vast">
								<button type="button" class="linkknop tekstlinks" onclick={() => bekijkVast(w)}>
									<strong>{w.naam ?? `${w.van.naam} → ${w.naar.naam}`}</strong><br />
									<span class="zwak klein">{w.soort === 'aankomst' ? 'Aankomst' : 'Vertrek'} {w.tijd}</span>
								</button>
								<button class="knop klein" onclick={() => startVast(w)} disabled={vasteBezig !== null}>
									<Play size={16} /> {vasteBezig === w.id ? 'Plannen…' : 'Start'}
								</button>
							</div>
						{/each}
						{#if vasteFout}<p class="status-fout klein">{vasteFout}</p>{/if}
					</div>
				{/if}

				{#if data.favorieten.length > 0}
					<div class="kaart stapel">
						<h2 class="rij"><Star size={20} aria-hidden="true" /> Favoriete reizen</h2>
						{#each data.favorieten.slice(0, 4) as f (f.id)}
							<button
								type="button"
								class="linkknop tekstlinks rij tussen"
								onclick={() => {
									planner.zetReis(f.van, f.naar, f.via ?? null, f.voorkeur);
									void plan();
								}}
							>
								<span><strong>{f.naam ?? f.naar.naam}</strong><br /><span class="zwak klein">{f.van.naam} → {f.naar.naam}{f.via ? ` via ${f.via.naam}` : ''}</span></span>
								<ChevronRight size={18} aria-hidden="true" />
							</button>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{:else}
		<button class="kaart samenvatting rij tussen" onclick={() => (formulierOpen = true)} aria-label="Zoekopdracht aanpassen">
			<span>
				<strong>{planner.van?.naam} → {planner.naar?.naam}</strong><br />
				<span class="zwak klein">{momentTekst}{planner.via ? ` · via ${planner.via.naam}` : ''}</span>
			</span>
			<Pencil size={18} aria-hidden="true" />
		</button>
	{/if}

	{#if planner.adviezen.length > 0 || planner.laden}
		<section class="stapel" bind:this={resultatenEl} aria-labelledby="resultaten-kop">
			<div class="rij tussen">
				<h2 id="resultaten-kop">Reisadviezen</h2>
				<button type="button" class="icoonknop" aria-label={favoriet ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'} aria-pressed={!!favoriet} onclick={wisselFavoriet}>
					<Star size={20} fill={favoriet ? 'currentColor' : 'none'} />
				</button>
			</div>

			<div class="chips" role="group" aria-label="Sorteer op">
				{#each voorkeuren as v (v)}
					{#if v !== 'drukte' || toonDrukteKeuze}
						<button type="button" class="chip" aria-pressed={planner.voorkeur === v} disabled={planner.laden !== null} onclick={() => planner.kiesVoorkeur(v)}>{VOORKEUR_LABELS[v]}</button>
					{/if}
				{/each}
			</div>

			{#if planner.melding}
				<div class="melding waarschuwing" role="status"><Info size={18} /> <span>{planner.melding}</span></div>
			{/if}
			{#if planner.fout}
				<div class="melding fout" role="alert"><TriangleAlert size={18} /> <span>{planner.fout}</span></div>
			{/if}
			{#if planner.voorkeur === 'drukte' && !planner.drukteBeschikbaar && planner.gezocht}
				<p class="zwak klein">Drukte is alleen bekend voor NS-treinen; voor deze reizen is die niet beschikbaar.</p>
			{/if}

			{#if planner.vorige}
				<button class="knop tweede" onclick={() => planner.meer('eerder')} disabled={planner.laden !== null}>
					<Clock size={18} /> {planner.laden === 'eerder' ? 'Laden…' : 'Eerder'}
				</button>
			{/if}

			{#if planner.laden === 'nieuw'}
				{#each [1, 2, 3] as i (i)}<div class="kaart skelet" aria-hidden="true"></div>{/each}
			{:else}
				{#each planner.adviezen as advies (advies.id)}
					<AdviesKaart {advies} href="/advies/{advies.id}" toonDrukte={planner.drukteBeschikbaar} />
				{/each}
			{/if}

			{#if planner.volgende}
				<button class="knop tweede" onclick={() => planner.meer('later')} disabled={planner.laden !== null}>
					<Clock size={18} /> {planner.laden === 'later' ? 'Laden…' : 'Later'}
				</button>
			{/if}
			{#if planner.opgehaaldOp}
				<p class="zwak klein midden">
					{planner.bron === 'ns' ? 'Via NS-planner' : 'Via Transitous'} · opgehaald om {klok(planner.opgehaaldOp)}{planner.uitCache ? ' (opgeslagen)' : ''}
				</p>
			{/if}
			<button class="knop tweede" onclick={() => { planner.adviezen = []; planner.gezocht = null; formulierOpen = true; }}>
				<X size={18} /> Nieuwe zoekopdracht
			</button>
		</section>
	{/if}
</main>

<Onderblad bind:open={huisOpen} titel="Laatste verbinding naar huis">
	{#if huisBezig}
		<p class="zwak">Locatie bepalen en zoeken…</p>
	{:else if huisFout}
		<div class="melding fout"><TriangleAlert size={18} /> <span>{huisFout}</span></div>
		{#if !data.profiel.thuislocatie}<a class="knop vol" href="/instellingen" onclick={() => (huisOpen = false)}>Thuislocatie instellen</a>{/if}
	{:else if huis?.advies}
		<div class="stapel">
			<div class="groot-getal">
				<span class="zwak">Laatste vertrek</span>
				<strong class="tijd">{klok(huis.advies.vertrek.verwacht)}</strong>
			</div>
			<div class="melding {(huis.spelingMin ?? 0) < 15 ? 'fout' : (huis.spelingMin ?? 0) < 45 ? 'waarschuwing' : 'ok'}">
				<Clock size={18} />
				<span>Nog <strong>{duurTekst((huis.spelingMin ?? 0) * 60)}</strong> speling voordat je moet vertrekken.</span>
			</div>
			<AdviesKaart advies={huis.advies} href="/advies/{huis.advies.id}" />
			<button class="knop vol" onclick={async () => { if (huis?.advies) { await data.startReis(huis.van, huis.naar, huis.advies); huisOpen = false; goto('/reis'); } }}>
				<Play size={18} /> Start deze reis
			</button>
		</div>
	{:else if huis}
		<div class="melding waarschuwing"><Info size={18} /> <span>{huis.melding}</span></div>
	{/if}
</Onderblad>

<style>
	.van-naar {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		align-items: center;
	}
	.wissel {
		margin-top: 18px;
	}
	.linkknop {
		appearance: none;
		background: none;
		border: 0;
		padding: 4px 0;
		color: var(--primair);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}
	.tekstlinks {
		color: var(--tekst);
		font-weight: 400;
		width: 100%;
		min-height: 44px;
	}
	.datumtijd {
		gap: 8px;
	}
	.veldlabel {
		flex: 1;
		gap: 4px;
	}
	.actieve-reis,
	.snelknop,
	.samenvatting {
		appearance: none;
		width: 100%;
		text-align: left;
		color: inherit;
		text-decoration: none;
		font: inherit;
		gap: 12px;
		cursor: pointer;
	}
	.actieve-reis {
		border-color: var(--ok);
		background: var(--ok-zacht);
	}
	.actieve-reis span,
	.snelknop span {
		flex: 1;
	}
	.vast {
		gap: 12px;
	}
	.skelet {
		height: 116px;
		background: linear-gradient(90deg, var(--kaart) 0%, var(--kaart-2) 50%, var(--kaart) 100%);
		background-size: 200% 100%;
		animation: glans 1.2s linear infinite;
	}
	@keyframes glans {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}
	.midden {
		text-align: center;
		margin: 0;
	}
	.groot-getal {
		display: flex;
		flex-direction: column;
	}
	.groot-getal strong {
		font-size: 2.6rem;
		line-height: 1.1;
	}
	h2.rij {
		gap: 8px;
		margin: 0;
	}
</style>
