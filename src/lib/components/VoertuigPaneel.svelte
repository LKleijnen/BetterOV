<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Accessibility, Armchair, Bike, History, MapPin, Plug, Split, Toilet, TriangleAlert, VolumeX, Wifi } from '@lucide/svelte';
	import type { Advies, Leg, RitHistorie, TreinInfo, VoertuigPositie } from '$lib/types';
	import { api } from '$lib/client/api';
	import { haalTreinInfo, treinParams } from '$lib/client/trein';
	import { voertuigPositie } from '$lib/client/voertuigpositie';
	import { korteDatum, klok } from '$lib/tijd';
	import { LEEFTIJD_NAMEN, materieelSoort, type MaterieelSoort } from '$lib/materieel';
	import Drukte from './Drukte.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import TreinVerticaal from './TreinVerticaal.svelte';
	import Kaart from './Kaart.svelte';

	let { leg, info: voorgeladen }: { leg: Leg; info?: TreinInfo | null } = $props();

	const trein = $derived(leg.modus === 'trein' && !!leg.ritnummer);

	let info = $state<TreinInfo | null>(null);
	let fout = $state<string | null>(null);
	let laden = $state(false);
	let ruw = $state<string | null>(null);
	let historie = $state<Record<string, RitHistorie[]>>({});

	$effect(() => {
		const l = leg;
		const vooraf = voorgeladen;
		untrack(() => {
			info = vooraf ?? null;
			fout = null;
			historie = {};
			if (vooraf) {
				void laadHistorie(vooraf);
				return;
			}
			if (l.modus !== 'trein' || !l.ritnummer) return;
			laden = true;
			haalTreinInfo(l)
				.then((r) => {
					info = r;
					void laadHistorie(r);
				})
				.catch((e) => (fout = (e as Error).message))
				.finally(() => (laden = false));
		});
	});

	async function laadHistorie(i: TreinInfo) {
		const nummers = [...new Set(i.delen.map((d) => d.nummer).filter((n): n is string => !!n))];
		if (!nummers.length) return;
		const r = await api<{ historie: Record<string, RitHistorie[]> }>(`/api/voertuig/historie?nummers=${nummers.join(',')}`).catch(() => null);
		if (r) historie = r.historie;
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
	const splitsing = $derived(info?.splitsing?.voorUitstappen ? info.splitsing : undefined);
	const splitsTekst = $derived.by(() => {
		if (!info || !splitsing) return null;
		const jouw = splitsing.jouwDelen;
		const naarJouw = splitsing.bestemmingen.find((b) => jouw.includes(b.deel))?.naar;
		const anderen = [...new Set(splitsing.bestemmingen.filter((b) => !jouw.includes(b.deel)).map((b) => b.naar))];
		// Positie vanaf de voorkant (bij rijrichting rechts staat het laatste deel voorop)
		const richting = info.instapadvies?.rijrichting;
		const n = info.delen.length;
		const vanVoren = (i: number) => (richting === 'rechts' ? n - 1 - i : i);
		const posities = jouw.map(vanVoren);
		const plek = !richting ? '' : posities.every((p) => p === 0) ? 'voorste' : posities.every((p) => p === n - 1) ? 'achterste' : 'middelste';
		return {
			kop: `Deze trein splitst${splitsing.station ? ` in ${splitsing.station}` : ' onderweg'}`,
			jouw: `Zit in het ${plek ? `${plek} ` : ''}deel${naarJouw ? ` naar ${naarJouw}` : ''}.`,
			anders: anderen.length ? `Het andere deel gaat naar ${anderen.join(' en ')}.` : ''
		};
	});

	// ---------- Achtergrond per treintype ----------
	const soorten = $derived.by(() => {
		const gezien = new Map<string, { soort: MaterieelSoort; nummers: string[] }>();
		for (const d of info?.delen ?? []) {
			const soort = materieelSoort(d.type ?? info?.type);
			if (!soort) continue;
			const bestaand = gezien.get(soort.code) ?? { soort, nummers: [] };
			if (d.nummer) bestaand.nummers.push(d.nummer);
			gezien.set(soort.code, bestaand);
		}
		return [...gezien.values()];
	});

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

	$effect(() => {
		if (!kaartOpen) return;
		untrack(() => {
			const werkBij = async () => (positie = await voertuigPositie(leg));
			void werkBij();
			timer = setInterval(werkBij, 15000);
		});
		return () => clearInterval(timer);
	});
	onDestroy(() => clearInterval(timer));

	const heeftHistorie = $derived(Object.values(historie).some((r) => r.length > 0));
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

			{#if splitsTekst}
				<div class="melding info splits" role="note">
					<Split size={18} />
					<span><strong>{splitsTekst.kop}.</strong> {splitsTekst.jouw} {splitsTekst.anders}</span>
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
					<TreinVerticaal {info} />
				</section>
			{/if}

			{#if soorten.length}
				<section class="stapel sectie">
					<h3>Over deze trein</h3>
					{#each soorten as { soort, nummers } (soort.code)}
						<div class="soort">
							<div class="rij tussen">
								<strong>{soort.naam}</strong>
								<span class="leeftijd {soort.leeftijd}">{LEEFTIJD_NAMEN[soort.leeftijd]}</span>
							</div>
							<p class="klein zwak">
								Gebouwd {soort.gebouwd}{soort.gemoderniseerd ? `, gemoderniseerd ${soort.gemoderniseerd}` : ''}{soort.snelheid ? ` · tot ${soort.snelheid} km/u` : ''}{soort.bouwer ? ` · ${soort.bouwer}` : ''}
							</p>
							<p class="klein">{soort.omschrijving}</p>
							{#if nummers.length}<p class="klein zwak">Treinstel {nummers.join(', ')}</p>{/if}
						</div>
					{/each}
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
				<Kaart advies={ritAdvies} voertuig={positie} hoogte="240px" />
			</div>
			<p class="klein zwak">{positie?.soort === 'gps' ? 'GPS-positie van de trein (NS).' : 'Geschatte positie op basis van de actuele dienstregeling.'}</p>
		{/if}
	</details>

	{#if heeftHistorie}
		<section class="stapel sectie">
			<h3 class="rij"><History size={16} aria-hidden="true" /> Eerder gereden</h3>
			{#each Object.entries(historie) as [nummer, ritten] (nummer)}
				{#if ritten.length}
					<div>
						{#if Object.keys(historie).length > 1}<p class="klein zwak">Treinstel {nummer}</p>{/if}
						<ul class="lijst historie klein">
							{#each ritten.slice(0, 6) as r (r.datum + r.ritnummer)}
								<li class="rij">
									<span class="zwak getal datum">{korteDatum(`${r.datum}T12:00:00Z`)}{r.vertrek ? ` ${klok(r.vertrek)}` : ''}</span>
									<span class="flex">{r.van && r.naar ? `${r.van} → ${r.naar}` : `rit ${r.ritnummer}`}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
			<p class="klein zwak">Ritten die dit treinstel reed toen iemand in BetterOV deze trein bekeek.</p>
		</section>
	{/if}

	{#if trein && info}
		<details class="sectie">
			<summary class="klein zwak" onclick={() => !ruw && toonRuw()}>Ruwe NS-data (voor controle)</summary>
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
	.historie {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.datum {
		min-width: 96px;
	}
	.flex {
		flex: 1;
		min-width: 0;
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
