<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowUpDown, CalendarDays, ChevronRight, Clock, History, House, Info, MapPin, Navigation, Play, Search, SlidersHorizontal, Star, TriangleAlert } from '@lucide/svelte';
	import type { Plek, WeekItem } from '$lib/types';
	import { momentTekst, onthoudAdvies, planner, recenteZoekopdrachten, type RecenteZoekopdracht } from '$lib/client/planner.svelte';
	import { data } from '$lib/client/data.svelte';
	import { sessie } from '$lib/client/sessie.svelte';
	import { huidigePositie } from '$lib/client/gps';
	import { laatsteNaarHuis, startVasteReis, type LaatsteAntwoord } from '$lib/client/reisacties';
	import { klok, nlDatum, nlOnderdelen, duurTekst } from '$lib/tijd';
	import PlekInvoer from '$lib/components/PlekInvoer.svelte';
	import AdviesKaart from '$lib/components/AdviesKaart.svelte';
	import Onderblad from '$lib/components/Onderblad.svelte';
	import MomentKiezer from '$lib/components/MomentKiezer.svelte';
	import Reisopties from '$lib/components/Reisopties.svelte';
	import { aantalAfwijkend, optiesTekst } from '$lib/reisopties';

	let momentOpen = $state(false);
	let optiesOpen = $state(false);
	const aantalOpties = $derived(aantalAfwijkend(planner.opties) + (planner.via ? 1 : 0));
	let fout = $state<string | null>(null);

	$effect(() => {
		// Standaardvoorkeur uit het profiel gebruiken zolang er nog niet gezocht is
		if (!planner.gezocht && data.profiel.standaardvoorkeur) planner.voorkeur = data.profiel.standaardvoorkeur;
	});

	/** Zoeken en meteen naar de resultaten; die tonen zelf het laden */
	function plan() {
		fout = null;
		if (!planner.kan()) {
			fout = 'Kies waar je vandaan komt en waar je heen gaat.';
			return;
		}
		void planner.zoek();
		goto('/reisadviezen');
	}

	// ---------- Snel plannen vanaf je huidige locatie ----------
	let gpsBezig = $state<string | null>(null);

	async function vanafHier(naar: Plek, sleutel: string) {
		gpsBezig = sleutel;
		fout = null;
		try {
			const p = await huidigePositie();
			planner.zetReis({ naam: 'Huidige locatie', lat: p.lat, lon: p.lon, type: 'gps' }, naar);
			plan();
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			gpsBezig = null;
		}
	}

	const snelleBestemmingen = $derived([
		...(data.profiel.thuislocatie ? [{ sleutel: 'thuis', naam: 'Naar huis', plek: data.profiel.thuislocatie, thuis: true }] : []),
		...data.plekken.map((p) => ({ sleutel: p.id, naam: p.naam, plek: p.plek, thuis: false }))
	]);

	// ---------- Recent gezocht ----------
	const recent = $derived.by(() => {
		void planner.gezocht;
		return recenteZoekopdrachten().slice(0, 4);
	});

	function planOpnieuw(z: RecenteZoekopdracht) {
		if (z.van.type === 'gps') {
			void vanafHier(z.naar, `recent-${z.naar.naam}`);
			return;
		}
		planner.zetReis(z.van, z.naar, z.via ?? null);
		plan();
	}

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
		plan();
	}

	function planFavoriet(id: string) {
		const f = data.favorieten.find((x) => x.id === id);
		if (!f) return;
		planner.zetReis(f.van, f.naar, f.via ?? null, f.voorkeur);
		plan();
	}
</script>

<svelte:head><title>Plannen · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<h1 class="kop">{sessie.voornaam ? `Hoi ${sessie.voornaam}` : 'Waar wil je heen?'}</h1>

	<form class="kaart stapel formulier" onsubmit={(e) => (e.preventDefault(), plan())}>
		<div class="van-naar">
			<div class="stapel velden">
				<PlekInvoer label="Van" bind:waarde={planner.van} />
				<PlekInvoer label="Naar" bind:waarde={planner.naar} />
			</div>
			<button type="button" class="icoonknop wissel" aria-label="Van en naar omwisselen" onclick={() => planner.wissel()}>
				<ArrowUpDown size={20} />
			</button>
		</div>

		<div class="rij opties">
			<button type="button" class="knop tweede klein moment" onclick={() => (momentOpen = true)}>
				<Clock size={16} /> {momentTekst(planner)}
			</button>
			<button type="button" class="knop tweede klein" onclick={() => (optiesOpen = true)}>
				<SlidersHorizontal size={16} /> Reisopties
				{#if aantalOpties > 0}<span class="teller" aria-label="{aantalOpties} aangepast">{aantalOpties}</span>{/if}
			</button>
		</div>
		{#if planner.via || aantalOpties > 0}
			<p class="zwak klein samenvatting-opties">{[planner.via ? `via ${planner.via.naam}` : '', optiesTekst(planner.opties)].filter(Boolean).join(' · ')}</p>
		{/if}

		<button class="knop vol" type="submit"><Search size={20} /> Plan reis</button>
		{#if fout}
			<div class="melding fout" role="alert"><TriangleAlert size={18} /> <span>{fout}</span></div>
		{/if}
	</form>

	{#if data.actieveReis}
		<a class="kaart actieve-reis rij" href="/reis">
			<Navigation size={20} aria-hidden="true" />
			<span class="flex">
				<strong>Onderweg naar {data.actieveReis.naar.naam}</strong><br />
				<span class="zwak klein">Aankomst {klok(data.actieveReis.advies.aankomst.verwacht)}</span>
			</span>
			<ChevronRight size={20} aria-hidden="true" />
		</a>
	{/if}

	{#if planner.adviezen.length > 0 && planner.gezocht}
		<a class="kaart rij snelrij" href="/reisadviezen">
			<Search size={18} aria-hidden="true" />
			<span class="flex">Laatste zoekopdracht: <strong>{planner.gezocht.van.naam} → {planner.gezocht.naar.naam}</strong></span>
			<ChevronRight size={18} aria-hidden="true" />
		</a>
	{/if}

	{#if sessie.demo}
		<p class="zwak klein demo"><Info size={14} aria-hidden="true" /> Demo-modus: je gegevens staan alleen op dit apparaat.</p>
	{/if}

	{#if snelleBestemmingen.length > 0}
		<section class="stapel sectie" aria-labelledby="snel-kop">
			<h2 id="snel-kop" class="zwak klein">Vanaf je locatie</h2>
			<div class="chips">
				{#each snelleBestemmingen as b (b.sleutel)}
					<button type="button" class="chip bestemming" onclick={() => vanafHier(b.plek, b.sleutel)} disabled={gpsBezig !== null}>
						{#if b.thuis}<House size={16} aria-hidden="true" />{:else}<MapPin size={16} aria-hidden="true" />{/if}
						{gpsBezig === b.sleutel ? 'Locatie…' : b.naam}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if vandaag.length > 0}
		<section class="stapel sectie" aria-labelledby="vast-kop">
			<h2 id="vast-kop" class="zwak klein rij"><CalendarDays size={16} aria-hidden="true" /> Vaste reizen vandaag</h2>
			<ul class="lijst kaart lijstkaart">
				{#each vandaag as w (w.id)}
					<li class="rij tussen">
						<button type="button" class="regel" onclick={() => bekijkVast(w)}>
							<strong>{w.naam ?? `${w.van.naam} → ${w.naar.naam}`}</strong>
							<span class="zwak klein">{w.soort === 'aankomst' ? 'Aankomst' : 'Vertrek'} {w.tijd}</span>
						</button>
						<button class="knop klein" onclick={() => startVast(w)} disabled={vasteBezig !== null}>
							<Play size={14} /> {vasteBezig === w.id ? 'Plannen…' : 'Start'}
						</button>
					</li>
				{/each}
			</ul>
			{#if vasteFout}<p class="status-fout klein">{vasteFout}</p>{/if}
		</section>
	{/if}

	{#if data.favorieten.length > 0}
		<section class="stapel sectie" aria-labelledby="fav-kop">
			<h2 id="fav-kop" class="zwak klein rij"><Star size={16} aria-hidden="true" /> Favoriete reizen</h2>
			<ul class="lijst kaart lijstkaart">
				{#each data.favorieten.slice(0, 4) as f (f.id)}
					<li>
						<button type="button" class="regel rij tussen" onclick={() => planFavoriet(f.id)}>
							<span class="flex">
								<strong>{f.naam ?? f.naar.naam}</strong><br />
								<span class="zwak klein">{f.van.naam} → {f.naar.naam}{f.via ? ` via ${f.via.naam}` : ''}</span>
							</span>
							<ChevronRight size={18} aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if recent.length > 0}
		<section class="stapel sectie" aria-labelledby="recent-kop">
			<h2 id="recent-kop" class="zwak klein rij"><History size={16} aria-hidden="true" /> Recent gezocht</h2>
			<ul class="lijst kaart lijstkaart">
				{#each recent as z, i (i)}
					<li>
						<button type="button" class="regel rij tussen" onclick={() => planOpnieuw(z)}>
							<span class="flex ellips">{z.van.type === 'gps' ? 'Huidige locatie' : z.van.naam} → <strong>{z.naar.naam}</strong>{z.via ? ` via ${z.via.naam}` : ''}</span>
							<ChevronRight size={18} aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<button class="kaart rij snelrij" onclick={naarHuis}>
		<House size={18} aria-hidden="true" />
		<span class="flex">Laatste verbinding naar huis</span>
		<ChevronRight size={18} aria-hidden="true" />
	</button>
</main>

<MomentKiezer bind:open={momentOpen} />
<Reisopties bind:open={optiesOpen} />

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
				<span>Nog <strong>{duurTekst((huis.spelingMin ?? 0) * 60)}</strong> voordat je moet vertrekken.</span>
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
	.kop {
		margin: 0;
	}
	.formulier {
		gap: 8px;
	}
	.van-naar {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px;
		align-items: center;
	}
	.velden {
		gap: 6px;
	}
	.opties {
		gap: 10px;
		flex-wrap: wrap;
	}
	.moment {
		flex: 0 1 auto;
	}
	.teller {
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--primair);
		color: var(--primair-tekst);
		font-size: 0.72rem;
		line-height: 18px;
		text-align: center;
	}
	.samenvatting-opties {
		margin: 0;
	}
	.actieve-reis,
	.snelrij {
		appearance: none;
		width: 100%;
		text-align: left;
		color: inherit;
		text-decoration: none;
		font: inherit;
		gap: 10px;
		cursor: pointer;
	}
	.actieve-reis {
		border-color: var(--ok);
		background: var(--ok-zacht);
	}
	.flex {
		flex: 1;
		min-width: 0;
	}
	.ellips {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.demo {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}
	.sectie {
		gap: 6px;
	}
	.sectie h2 {
		margin: 4px 0 0;
		gap: 6px;
		font-weight: 650;
	}
	.bestemming {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.lijstkaart {
		padding: 2px 14px;
	}
	.lijstkaart li + li {
		border-top: 1px solid var(--rand);
	}
	.lijstkaart li {
		gap: 8px;
	}
	.regel {
		appearance: none;
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 50px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		padding: 6px 0;
		border: 0;
		background: none;
		color: var(--tekst);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.regel.rij {
		flex-direction: row;
		align-items: center;
	}
	.groot-getal {
		display: flex;
		flex-direction: column;
	}
	.groot-getal strong {
		font-size: 2.4rem;
		line-height: 1.1;
	}
</style>
