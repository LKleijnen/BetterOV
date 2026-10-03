<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Accessibility, ArrowRight, Bike, ChevronLeft, Clock, ExternalLink, Navigation, Route, Signpost, TrainTrack } from '@lucide/svelte';
	import type { Plek, StationInfo, Voorziening } from '$lib/types';
	import { api } from '$lib/client/api';
	import { schrijf } from '$lib/client/opslag';
	import { planner } from '$lib/client/planner.svelte';
	import { klok } from '$lib/tijd';
	import Kaart from '$lib/components/Kaart.svelte';

	// Station op code, of op naam en plek (vanuit een reisadvies of de kaart).
	// Komt je vanaf een overstap, dan staan ook de sporen erbij: ?aankomst=5&vertrek=11b
	const p = $derived(page.url.searchParams);
	const vraag = $derived.by(() => {
		const q = new URLSearchParams();
		for (const k of ['code', 'naam', 'lat', 'lon']) {
			const w = p.get(k);
			if (w) q.set(k, w);
		}
		return q.toString();
	});
	const aankomstSpoor = $derived(p.get('aankomst') ?? undefined);
	const vertrekSpoor = $derived(p.get('vertrek') ?? undefined);

	let station = $state<StationInfo | null>(null);
	let fout = $state<string | null>(null);
	let laden = $state(true);
	let voor = '';
	$effect(() => {
		const q = vraag;
		if (q === voor) return;
		voor = q;
		laden = true;
		fout = null;
		api<StationInfo>(`/api/station?${q}`, { timeoutMs: 12000 })
			.then((s) => (station = s))
			.catch((e) => (fout = (e as Error).message))
			.finally(() => (laden = false));
	});

	const TYPE_NAMEN: Record<string, string> = {
		MEGA_STATION: 'Groot knooppunt',
		KNOOPPUNT_INTERCITY_STATION: 'Intercitystation (knooppunt)',
		INTERCITY_STATION: 'Intercitystation',
		KNOOPPUNT_SNELTREIN_STATION: 'Sneltreinstation (knooppunt)',
		SNELTREIN_STATION: 'Sneltreinstation',
		KNOOPPUNT_STOPTREIN_STATION: 'Sprinterstation (knooppunt)',
		STOPTREIN_STATION: 'Sprinterstation',
		FACULTATIEF_STATION: 'Station (stopt niet altijd)'
	};

	// Voorzieningen per soort, met een eigen kleur op de kaart
	const KLEUREN = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#4b5563'];
	const groepen = $derived.by(() => {
		const uit = new Map<string, Voorziening[]>();
		for (const v of station?.voorzieningen ?? []) {
			const naam = v.soortNaam ?? soortNaam(v.soort);
			uit.set(naam, [...(uit.get(naam) ?? []), v]);
		}
		return [...uit].map(([naam, items], i) => ({ naam, items, kleur: KLEUREN[i % KLEUREN.length] }));
	});
	const punten = $derived(
		groepen.flatMap((g) => g.items.filter((v) => v.lat !== undefined && v.lon !== undefined).map((v) => ({ lat: v.lat!, lon: v.lon!, naam: v.naam, kleur: g.kleur })))
	);

	function soortNaam(soort: string): string {
		const s = soort.toLowerCase();
		if (s.includes('ovfiets')) return 'OV-fiets';
		if (s.includes('facility')) return 'Stationsvoorzieningen';
		if (s.includes('shop') || s.includes('horeca') || s.includes('food')) return 'Winkels en horeca';
		if (s.includes('bike') || s.includes('fiets')) return 'Fietsen';
		if (s.includes('car') || s.includes('taxi') || s.includes('parking')) return 'Auto en taxi';
		return 'Overig';
	}

	// Vandaag open? (dag 1 = maandag)
	const vandaag = ((new Date().getDay() + 6) % 7) + 1;
	const tijdenVandaag = (v: Voorziening) => v.openingstijden?.filter((t) => t.dag === vandaag) ?? [];

	const plek = $derived<Plek | null>(station ? { naam: station.naam, lat: station.lat, lon: station.lon, type: 'station' } : null);

	function vertrektijden() {
		if (!plek) return;
		schrijf('vertrek-halte', plek);
		goto('/vertrektijden');
	}
	function planHierheen() {
		if (!plek) return;
		planner.naar = plek;
		goto('/');
	}
	function planVanafHier() {
		if (!plek) return;
		planner.van = plek;
		goto('/');
	}
</script>

<svelte:head><title>{station?.naam ?? 'Station'} · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij kop">
		<button class="icoonknop" aria-label="Terug" onclick={() => (history.length > 1 ? history.back() : goto('/'))}><ChevronLeft size={22} /></button>
		<div class="titel">
			<h1>{station?.naam ?? p.get('naam') ?? 'Station'}</h1>
			{#if station}
				<span class="zwak klein">{station.type ? (TYPE_NAMEN[station.type] ?? 'Station') : 'Station'} · {station.code}</span>
			{/if}
		</div>
	</div>

	{#if laden && !station}
		<p class="zwak">Stationsinformatie ophalen…</p>
	{:else if fout && !station}
		<div class="kaart stapel">
			<p>{fout}</p>
			<p class="zwak klein">Stationsinformatie is er alleen voor NS-stations.</p>
		</div>
	{:else if station}
		{#if aankomstSpoor || vertrekSpoor}
			<div class="melding info overstap" role="note">
				<Route size={18} />
				<span>
					<strong>Overstap:</strong>
					{#if aankomstSpoor}aankomst spoor <strong>{aankomstSpoor}</strong>{/if}
					{#if aankomstSpoor && vertrekSpoor}<ArrowRight size={14} aria-hidden="true" />{/if}
					{#if vertrekSpoor}vertrek spoor <strong>{vertrekSpoor}</strong>{/if}
				</span>
			</div>
		{/if}

		<div class="actiebalk">
			<button onclick={vertrektijden}><Signpost size={18} /> Vertrektijden</button>
			<button onclick={planHierheen}><Navigation size={18} /> Hierheen</button>
			<button onclick={planVanafHier}><Route size={18} /> Vanaf hier</button>
		</div>

		<!-- Plattegrond: nu de kaart ingezoomd op het station, met de voorzieningen als puntjes -->
		<section class="stapel" aria-labelledby="plattegrond">
			<h2 id="plattegrond">Plattegrond</h2>
			<Kaart midden={{ lat: station.lat, lon: station.lon, zoom: 16.3 }} {punten} hoogte="300px" />
			{#if groepen.length && punten.length}
				<ul class="lijst legenda klein">
					{#each groepen as g (g.naam)}<li><span class="bol" style:background={g.kleur}></span> {g.naam}</li>{/each}
				</ul>
			{/if}
		</section>

		{#if station.sporen.length}
			<section class="stapel" aria-labelledby="sporen">
				<h2 id="sporen">Sporen</h2>
				<ul class="lijst sporen">
					{#each station.sporen as s (s)}
						<li class:gemarkeerd={s === aankomstSpoor || s === vertrekSpoor}><TrainTrack size={14} aria-hidden="true" /> {s}</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if station.reisassistentie !== undefined}
			<p class="rij klein assist">
				<Accessibility size={16} aria-hidden="true" />
				{station.reisassistentie ? 'Reisassistentie mogelijk (aanvragen bij NS).' : 'Geen reisassistentie op dit station.'}
			</p>
		{/if}

		<section class="stapel" aria-labelledby="voorzieningen">
			<h2 id="voorzieningen">Voorzieningen</h2>
			{#each groepen as g (g.naam)}
				<div class="kaart stapel groep">
					<h3 class="rij"><span class="bol" style:background={g.kleur}></span> {g.naam}</h3>
					<ul class="lijst items">
						{#each g.items as v, i (i)}
							<li>
								<div class="rij tussen">
									<strong>{v.naam}</strong>
									{#if v.open === true}<span class="status open klein">Open</span>{:else if v.open === false}<span class="status dicht klein">Dicht</span>{/if}
								</div>
								{#if v.ovFietsen !== undefined}<p class="rij klein"><Bike size={14} aria-hidden="true" /> {v.ovFietsen} fietsen beschikbaar</p>{/if}
								{#if tijdenVandaag(v).length}
									<p class="rij klein zwak"><Clock size={14} aria-hidden="true" /> Vandaag {tijdenVandaag(v).map((t) => `${t.van}–${t.tot}`).join(', ')}</p>
								{/if}
								{#if v.beschrijving}<p class="klein">{v.beschrijving}</p>{/if}
								{#if v.link}<a class="klein" href={v.link} target="_blank" rel="noopener">Meer informatie <ExternalLink size={12} /></a>{/if}
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="zwak">NS geeft voor dit station geen voorzieningen door.</p>
			{/each}
		</section>

		<p class="klein zwak">Bron: {station.bron.join(', ')} · {klok(station.opgehaaldOp)}</p>
	{/if}
</main>

<style>
	.kop {
		align-items: center;
	}
	.titel {
		flex: 1;
		min-width: 0;
	}
	.titel h1 {
		margin: 0;
		font-size: 1.25rem;
	}
	h2 {
		margin: 4px 0 0;
		font-size: 1.05rem;
	}
	h3 {
		margin: 0;
		gap: 8px;
		font-size: 0.98rem;
	}
	p {
		margin: 0;
	}
	.overstap span {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
	}
	.legenda {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.legenda li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.bol {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 0 0 1px var(--rand);
	}
	.sporen {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.sporen li {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 8px;
		background: var(--kaart);
		border: 1px solid var(--rand);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.sporen li.gemarkeerd {
		background: var(--primair);
		border-color: var(--primair);
		color: var(--bg);
	}
	.assist {
		gap: 6px;
		align-items: center;
	}
	.groep {
		gap: 8px;
	}
	.items {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.items li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.items li + li {
		padding-top: 10px;
		border-top: 1px solid var(--rand);
	}
	.items .rij {
		gap: 6px;
		align-items: center;
	}
	.status {
		padding: 0 7px;
		border-radius: 6px;
		font-weight: 700;
	}
	.status.open {
		background: var(--ok-zacht);
		color: var(--ok);
	}
	.status.dicht {
		background: var(--kaart-2);
		color: var(--tekst-zwak);
	}
</style>
