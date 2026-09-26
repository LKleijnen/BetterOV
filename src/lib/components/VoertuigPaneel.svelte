<script lang="ts">
	import { Accessibility, Bike, Plug, Toilet, TriangleAlert, VolumeX, Wifi, Armchair, Info } from '@lucide/svelte';
	import type { Leg, TreinInfo } from '$lib/types';
	import { api } from '$lib/client/api';
	import { haalTreinInfo, treinParams } from '$lib/client/trein';
	import { klok } from '$lib/tijd';
	import { legNaam } from '$lib/reis';
	import Drukte from './Drukte.svelte';
	import TreinWeergave from './TreinWeergave.svelte';

	let { leg, info: voorgeladen }: { leg: Leg; info?: TreinInfo | null } = $props();

	let info = $state<TreinInfo | null>(null);
	let fout = $state<string | null>(null);
	let laden = $state(false);
	let ruw = $state<string | null>(null);

	$effect(() => {
		if (voorgeladen) {
			info = voorgeladen;
			return;
		}
		if (!leg.isNS || !leg.ritnummer) return;
		laden = true;
		fout = null;
		haalTreinInfo(leg)
			.then((r) => (info = r))
			.catch((e) => (fout = (e as Error).message))
			.finally(() => (laden = false));
	});

	async function toonRuw() {
		try {
			const r = await api<unknown>(`/api/trein/${leg.ritnummer}?${treinParams(leg, { ruw: '1' })}`);
			ruw = JSON.stringify(r, null, 2);
		} catch (e) {
			ruw = (e as Error).message;
		}
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
</script>

<div class="stapel">
	<div>
		<div class="rij" style="flex-wrap: wrap">
			<strong>{legNaam(leg)}</strong>
			{#if leg.ritnummer}<span class="zwak">rit {leg.ritnummer}</span>{/if}
		</div>
		<div class="zwak klein">
			{klok(leg.vertrek.verwacht)} {leg.van.naam} → {leg.richting ?? leg.naar.naam}
			{#if leg.vervoerder} · {leg.vervoerder}{/if}
		</div>
	</div>

	{#if leg.isNS}
		{#if laden}
			<p class="zwak">Treininformatie ophalen…</p>
		{:else if fout}
			<div class="melding fout"><TriangleAlert size={18} /> <span>{fout}</span></div>
		{:else if info}
			{#if info.ingekort}
				<div class="melding waarschuwing" role="alert">
					<TriangleAlert size={18} />
					<span>
						<strong>Kortere trein</strong>{#if info.aantalBakken && info.normaalBakken}: {info.aantalBakken} bakken in plaats van {info.normaalBakken}{/if}.
						Ga niet helemaal aan het eind van het perron staan.
					</span>
				</div>
			{/if}

			<div class="rij" style="flex-wrap: wrap; gap: 6px 16px">
				{#if info.type}<span><span class="zwak">Materieel</span> <strong>{info.type}</strong></span>{/if}
				{#if info.aantalBakken}<span><span class="zwak">Lengte</span> <strong>{info.aantalBakken} bakken</strong>{#if info.normaalBakken && !info.ingekort} <span class="zwak">(normaal)</span>{/if}</span>{/if}
				{#if info.lengteMeter}<span class="zwak">{info.lengteMeter} m</span>{/if}
				{#if info.zitplaatsen}<span><span class="zwak">Zitplaatsen</span> <strong>{info.zitplaatsen}</strong></span>{/if}
				{#if info.spoor}<span><span class="zwak">Spoor</span> <strong>{info.spoor}</strong></span>{/if}
			</div>
			{#if info.drukte}<Drukte drukte={info.drukte} />{/if}

			<section>
				<h3>Instapadvies</h3>
				<TreinWeergave {info} />
				{#each info.instapadvies?.samenvatting ?? ['Geen indeling bekend.'] as regel, i (i)}
					<p class="klein" class:zwak={i > 1}>{regel}</p>
				{/each}
			</section>

			{#if info.faciliteiten.length}
				<section>
					<h3>Faciliteiten</h3>
					<ul class="lijst faciliteiten">
						{#each info.faciliteiten as f (f)}
							<li class="rij">
								{#if f === 'TOILET'}<Toilet size={18} />{:else if f === 'STILTE'}<VolumeX size={18} />{:else if f === 'STROOM'}<Plug size={18} />{:else if f === 'WIFI'}<Wifi size={18} />{:else if f === 'TOEGANKELIJK'}<Accessibility size={18} />{:else if f === 'FIETS'}<Bike size={18} />{:else}<Armchair size={18} />{/if}
								{faciliteitNamen[f] ?? f.toLowerCase()}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if info.delen.length}
				<section>
					<h3>Treinstellen</h3>
					<ul class="lijst klein">
						{#each info.delen as d, i (i)}
							<li>{d.type ?? 'Onbekend type'}{#if d.nummer} · nr. {d.nummer}{/if}{#if d.bakken} · {d.bakken} bakken{/if}{#if d.eindbestemming} · naar {d.eindbestemming}{/if}</li>
						{/each}
					</ul>
				</section>
			{/if}
			<p class="klein zwak">Bron: {info.bron.join(', ')} · {klok(info.opgehaaldOp)}</p>
			<details>
				<summary class="klein zwak" onclick={() => !ruw && toonRuw()}>Ruwe NS-data (voor controle)</summary>
				<pre class="ruw">{ruw ?? 'Laden…'}</pre>
			</details>
		{/if}
	{:else}
		<div class="rij" style="flex-wrap: wrap; gap: 6px 16px">
			{#if leg.lijn}<span><span class="zwak">Lijn</span> <strong>{leg.lijn}</strong></span>{/if}
			{#if leg.vervoerder}<span><span class="zwak">Vervoerder</span> <strong>{leg.vervoerder}</strong></span>{/if}
			{#if leg.rolstoel !== undefined}<span class="rij"><Accessibility size={16} /> {leg.rolstoel ? 'Rolstoeltoegankelijk' : 'Niet rolstoeltoegankelijk'}</span>{/if}
			{#if leg.fietsen}<span class="rij"><Bike size={16} /> Fiets mag mee</span>{/if}
		</div>
		<div class="melding info">
			<Info size={18} />
			<span>Het voertuignummer van bussen en trams staat niet in de open data die deze app gebruikt. Het nummer staat meestal voorin en boven de deuren van het voertuig.</span>
		</div>
		{#if leg.tripId}<p class="klein zwak">Rit-ID: {leg.tripId}</p>{/if}
	{/if}
</div>

<style>
	section h3 {
		margin: 8px 0 4px;
	}
	p {
		margin: 2px 0;
	}
	.faciliteiten {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 12px;
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
