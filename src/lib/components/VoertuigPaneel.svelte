<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Accessibility, Armchair, Bike, Check, Copy, MapPin, Plug, Split, Toilet, TriangleAlert, VolumeX, Wifi } from '@lucide/svelte';
	import type { Advies, Leg, TreinInfo, VoertuigPositie } from '$lib/types';
	import { api } from '$lib/client/api';
	import { haalTreinInfo, treinParams } from '$lib/client/trein';
	import { voertuigPositie } from '$lib/client/voertuigpositie';
	import { volledigeRit } from '$lib/client/rit';
	import { klok } from '$lib/tijd';
	import { LEEFTIJD_NAMEN, materieelSoort, type MaterieelSoort } from '$lib/materieel';
	import { splitsTekst } from '$lib/splitsen';
	import Drukte from './Drukte.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import TreinSchema from './TreinSchema.svelte';
	import Kaart from './Kaart.svelte';

	let { leg, info: voorgeladen }: { leg: Leg; info?: TreinInfo | null } = $props();

	const trein = $derived(leg.modus === 'trein' && !!leg.ritnummer);

	let info = $state<TreinInfo | null>(null);
	let fout = $state<string | null>(null);
	let laden = $state(false);
	let ruw = $state<string | null>(null);

	$effect(() => {
		const l = leg;
		const vooraf = voorgeladen;
		untrack(() => {
			info = vooraf ?? null;
			fout = null;
			if (vooraf) return;
			if (l.modus !== 'trein' || !l.ritnummer) return;
			laden = true;
			haalTreinInfo(l)
				.then((r) => (info = r))
				.catch((e) => (fout = (e as Error).message))
				.finally(() => (laden = false));
		});
	});

	let gekopieerd = $state(false);
	async function kopieerRuw() {
		if (!ruw) return;
		try {
			await navigator.clipboard.writeText(ruw);
			gekopieerd = true;
			setTimeout(() => (gekopieerd = false), 2500);
		} catch {
			gekopieerd = false;
		}
	}

	async function toonRuw() {
		try {
			const r = await api<unknown>(`/api/trein/${leg.ritnummer}?${treinParams(leg, { ruw: '1' })}`);
			ruw = JSON.stringify(r, null, 2);
		} catch (e) {
			ruw = (e as Error).message;
		}
	}

	// ---------- Splitsen: welk deel heb je nodig ----------
	const splits = $derived(splitsTekst(info));

	// ---------- Achtergrond per treintype ----------
	// Uit de samenstelling van NS; anders uit de productnaam van de planner (ICE, Eurostar, Nightjet, …)
	const soorten = $derived.by(() => {
		const gezien = new Map<string, { soort: MaterieelSoort; nummers: string[] }>();
		for (const d of info?.delen ?? []) {
			const soort = materieelSoort(d.type ?? info?.type);
			if (!soort) continue;
			const bestaand = gezien.get(soort.code) ?? { soort, nummers: [] };
			if (d.nummer) bestaand.nummers.push(d.nummer);
			gezien.set(soort.code, bestaand);
		}
		if (!gezien.size) {
			const soort = materieelSoort(info?.type) ?? materieelSoort(leg.productNaam) ?? materieelSoort(leg.lijn);
			if (soort) gezien.set(soort.code, { soort, nummers: [] });
		}
		return [...gezien.values()];
	});

	function feitjes(s: MaterieelSoort): [string, string][] {
		const uit: [string, string][] = [];
		if (s.vervoerders) uit.push(['Rijdt bij', s.vervoerders]);
		if (s.bouwer) uit.push(['Bouwer', s.bouwer]);
		if (s.gebouwd) uit.push(['Gebouwd', s.gebouwd]);
		if (s.inDienst) uit.push(['In dienst', s.inDienst]);
		if (s.gemoderniseerd) uit.push(['Gemoderniseerd', s.gemoderniseerd]);
		if (s.snelheid) uit.push(['Snelheid', `tot ${s.snelheid} km/u${s.snelheidNoot ? ` (${s.snelheidNoot})` : ''}`]);
		return uit;
	}

	const faciliteitNamen: Record<string, string> = {
		TOILET: 'Toilet',
		STILTE: 'Stiltecoupé',
		STROOM: 'Stopcontacten',
		WIFI: 'Wifi',
		TOEGANKELIJK: 'Toegankelijk',
		FIETS: 'Fietsplaatsen',
		BISTRO: 'Bistro'
	};

	// ---------- Live positie (alleen als je hem openklapt) ----------
	let kaartOpen = $state(false);
	let positie = $state<VoertuigPositie | null>(null);
	let timer: ReturnType<typeof setInterval> | undefined;
	const ritAdvies = $derived<Advies>({ id: 'voertuig', bron: 'transitous', vertrek: leg.vertrek, aankomst: leg.aankomst, duur: leg.duur, overstappen: 0, legs: [leg] });

	// De hele rit (ook vóór je instapt en na je uitstapt), zodat je ziet waar het voertuig nu is
	let rit = $state.raw<Leg | null>(null);
	$effect(() => {
		if (!kaartOpen) return;
		untrack(() => {
			const werkBij = async () => {
				// volledigeRit onthoudt de rit, dus dit is alleen de eerste keer een verzoek
				rit = await volledigeRit(leg);
				positie = await voertuigPositie(rit ?? leg);
			};
			void werkBij();
			timer = setInterval(werkBij, 15000);
		});
		return () => clearInterval(timer);
	});
	onDestroy(() => clearInterval(timer));
</script>

<div class="stapel paneel">
	<header class="rij kop">
		<LijnLabel {leg} />
		<div class="kopinfo">
			<strong>{leg.productNaam ?? 'Rit'}{leg.ritnummer ? ` ${leg.ritnummer}` : ''}</strong>
			<span class="zwak klein">richting {leg.richting ?? leg.naar.naam}{leg.vervoerder ? ` · ${leg.vervoerder}` : ''}</span>
		</div>
	</header>

	{#if trein}
		{#if laden}
			<p class="zwak">Treininformatie ophalen…</p>
		{:else if fout && !info}
			<p class="zwak klein">Van deze trein is nu geen samenstelling bekend.</p>
		{:else if info}
			{#if info.ingekort}
				<div class="melding waarschuwing" role="alert">
					<TriangleAlert size={18} />
					<span><strong>Kortere trein</strong>{#if info.aantalBakken && info.normaalBakken}: {info.aantalBakken} i.p.v. {info.normaalBakken} bakken{/if}. Ga niet helemaal aan het eind van het perron staan.</span>
				</div>
			{/if}

			{#if splits}
				<div class="melding info splits" role="note">
					<Split size={18} />
					<span><strong>{splits.kop}.</strong> {splits.jouw} {splits.anders}</span>
				</div>
			{/if}

			<div class="rij feiten klein">
				{#if info.aantalBakken}<span><strong>{info.aantalBakken}</strong> bakken</span>{/if}
				{#if info.lengteMeter}<span><strong>{info.lengteMeter}</strong> m</span>{/if}
				{#if info.zitplaatsen}<span><strong>{info.zitplaatsen}</strong> zitplaatsen</span>{/if}
				{#if info.spoor}<span>spoor <strong>{info.spoor}</strong></span>{/if}
				{#if info.drukte}<Drukte drukte={info.drukte} />{/if}
			</div>

			{#if info.delen.length}
				<section class="stapel sectie">
					<h3>Instapadvies</h3>
					{#if info.instapadvies?.samenvatting.length}
						<ul class="lijst advies klein">
							{#each info.instapadvies.samenvatting as regel, i (i)}<li>{regel}</li>{/each}
						</ul>
					{/if}
					<TreinSchema {info} />
				</section>
			{/if}

			{#if info.faciliteiten.length}
				<ul class="lijst faciliteiten klein" aria-label="Faciliteiten">
					{#each info.faciliteiten as f (f)}
						<li class="rij">
							{#if f === 'TOILET'}<Toilet size={16} />{:else if f === 'STILTE'}<VolumeX size={16} />{:else if f === 'STROOM'}<Plug size={16} />{:else if f === 'WIFI'}<Wifi size={16} />{:else if f === 'TOEGANKELIJK'}<Accessibility size={16} />{:else if f === 'FIETS'}<Bike size={16} />{:else}<Armchair size={16} />{/if}
							{faciliteitNamen[f] ?? f.toLowerCase()}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		{#if soorten.length && !laden}
			<section class="stapel sectie">
				<h3>Over deze trein</h3>
				{#each soorten as { soort, nummers } (soort.code)}
					<div class="soort">
						<div class="rij tussen">
							<strong>{soort.naam}</strong>
							{#if soort.leeftijd}<span class="leeftijd {soort.leeftijd}">{LEEFTIJD_NAMEN[soort.leeftijd]}</span>{/if}
						</div>
						<p class="klein">{soort.omschrijving}</p>
						<dl class="feitjes klein">
							{#each feitjes(soort) as [label, waarde] (label)}
								<dt class="zwak">{label}</dt>
								<dd>{waarde}</dd>
							{/each}
							{#if nummers.length}
								<dt class="zwak">{nummers.length > 1 ? 'Treinstellen' : 'Treinstel'}</dt>
								<dd>{nummers.join(', ')}</dd>
							{/if}
						</dl>
					</div>
				{/each}
			</section>
		{/if}
	{:else}
		<div class="rij feiten klein">
			{#if leg.rolstoel !== undefined}<span class="rij"><Accessibility size={16} /> {leg.rolstoel ? 'Rolstoeltoegankelijk' : 'Niet rolstoeltoegankelijk'}</span>{/if}
			{#if leg.fietsen}<span class="rij"><Bike size={16} /> Fiets mag mee</span>{/if}
		</div>
	{/if}

	<details class="sectie" bind:open={kaartOpen}>
		<summary class="rij"><MapPin size={16} /> Live positie</summary>
		{#if kaartOpen}
			<div class="kaartje">
				<Kaart advies={ritAdvies} ritten={[rit]} voertuig={positie} hoogte="240px" />
			</div>
			<p class="klein zwak">{positie?.soort === 'gps' ? 'GPS-positie van de trein (NS).' : 'Geschatte positie op basis van de actuele dienstregeling.'}</p>
		{/if}
	</details>

	{#if trein && info}
		<details class="sectie">
			<summary class="klein zwak" onclick={() => !ruw && toonRuw()}>Ruwe NS-data (voor controle)</summary>
			{#if ruw}
				<button type="button" class="knop tweede klein kopieer" onclick={kopieerRuw}>
					{#if gekopieerd}<Check size={16} /> Gekopieerd{:else}<Copy size={16} /> Kopieer alles{/if}
				</button>
			{/if}
			<pre class="ruw">{ruw ?? 'Laden…'}</pre>
		</details>
		<p class="klein zwak">Bron: {info.bron.join(', ')} · {klok(info.opgehaaldOp)}</p>
	{/if}
</div>

<style>
	.paneel {
		gap: 12px;
	}
	.kop {
		align-items: center;
		gap: 10px;
	}
	.kopinfo {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.feiten {
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.sectie {
		gap: 6px;
	}
	h3 {
		margin: 0;
		font-size: 0.95rem;
		gap: 6px;
	}
	p {
		margin: 0;
	}
	.advies {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.advies li::before {
		content: '• ';
		color: var(--tekst-zwak);
	}
	.soort {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--radius-klein);
		background: var(--kaart);
		border: 1px solid var(--rand);
	}
	.leeftijd {
		padding: 1px 8px;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 750;
		background: var(--kaart-2);
		color: var(--tekst-zwak);
	}
	.leeftijd.nieuw {
		background: var(--ok-zacht);
		color: var(--ok);
	}
	.leeftijd.modern,
	.leeftijd.gemoderniseerd {
		background: var(--info-zacht);
		color: var(--info);
	}
	.feitjes {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 12px;
		margin: 4px 0 0;
	}
	.feitjes dd {
		margin: 0;
	}
	.faciliteiten {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.faciliteiten li {
		gap: 4px;
	}
	details summary {
		cursor: pointer;
		gap: 6px;
		min-height: 36px;
		font-weight: 650;
	}
	.kaartje {
		margin-top: 6px;
	}
	.kopieer {
		margin: 8px 0;
	}
	.ruw {
		max-height: 260px;
		overflow: auto;
		font-size: 0.72rem;
		background: var(--kaart-2);
		padding: 8px;
		border-radius: 8px;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
