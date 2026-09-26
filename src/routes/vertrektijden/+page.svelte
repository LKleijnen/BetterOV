<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { LocateFixed, RefreshCw, TriangleAlert, Info, ChevronRight } from '@lucide/svelte';
	import type { Plek, Vertrek, VertrekAntwoord } from '$lib/types';
	import { api, metCache } from '$lib/client/api';
	import { huidigePositie } from '$lib/client/gps';
	import { lees, schrijf } from '$lib/client/opslag';
	import { klok, relatief, vertragingMinuten } from '$lib/tijd';
	import { spoorGewijzigd } from '$lib/reis';
	import PlekInvoer from '$lib/components/PlekInvoer.svelte';
	import ModusIcoon from '$lib/components/ModusIcoon.svelte';

	const INTERVAL = 30000;

	let halte = $state<Plek | null>(lees<Plek | null>('vertrek-halte', null));
	let inDeBuurt = $state<{ lat: number; lon: number } | null>(null);
	let antwoord = $state<VertrekAntwoord | null>(null);
	let opgehaaldOp = $state<string | null>(null);
	let uitCacheVlag = $state(false);
	let laden = $state(false);
	let fout = $state<string | null>(null);
	let filter = $state<'alles' | 'trein' | 'bus-tram'>('alles');
	let timer: ReturnType<typeof setInterval> | undefined;
	let nu = $state(Date.now());

	function params(): string | null {
		if (halte) {
			const p = new URLSearchParams({ naam: halte.naam, lat: String(halte.lat), lon: String(halte.lon) });
			if (halte.stopId) p.set('stopId', halte.stopId);
			return p.toString();
		}
		if (inDeBuurt) return new URLSearchParams({ lat: String(inDeBuurt.lat), lon: String(inDeBuurt.lon) }).toString();
		return null;
	}

	async function laad() {
		const p = params();
		if (!p || laden) return;
		laden = true;
		try {
			const r = await metCache(`vertrek:${halte?.stopId ?? halte?.naam ?? 'buurt'}`, () =>
				api<VertrekAntwoord>(`/api/vertrektijden?${p}`, { timeoutMs: 12000 })
			);
			antwoord = r.data;
			opgehaaldOp = r.opgehaaldOp;
			uitCacheVlag = r.uitCache;
			fout = r.uitCache ? `Kon niet verversen: ${r.fout}` : null;
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			laden = false;
			nu = Date.now();
		}
	}

	$effect(() => {
		// Nieuwe halte gekozen
		if (halte) {
			schrijf('vertrek-halte', halte);
			inDeBuurt = null;
			antwoord = null;
			void laad();
		}
	});

	async function buurt() {
		fout = null;
		try {
			const p = await huidigePositie();
			halte = null;
			inDeBuurt = { lat: p.lat, lon: p.lon };
			antwoord = null;
			await laad();
		} catch (e) {
			fout = (e as Error).message;
		}
	}

	onMount(() => {
		timer = setInterval(() => {
			nu = Date.now();
			if (document.visibilityState === 'visible') void laad();
		}, INTERVAL);
		const zichtbaar = () => document.visibilityState === 'visible' && void laad();
		document.addEventListener('visibilitychange', zichtbaar);
		return () => document.removeEventListener('visibilitychange', zichtbaar);
	});
	onDestroy(() => clearInterval(timer));

	const lijst = $derived(
		(antwoord?.vertrekken ?? []).filter((v) => {
			if (Date.parse(v.tijd.verwacht) < nu - 60000) return false;
			if (filter === 'trein') return v.modus === 'trein';
			if (filter === 'bus-tram') return v.modus !== 'trein';
			return true;
		})
	);
	const heeftTreinen = $derived((antwoord?.vertrekken ?? []).some((v) => v.modus === 'trein'));
	const heeftAnder = $derived((antwoord?.vertrekken ?? []).some((v) => v.modus !== 'trein'));

	function ritLink(v: Vertrek): string {
		const p = new URLSearchParams();
		if (v.tripId) p.set('tripId', v.tripId);
		if (v.ritnummer) p.set('ritnummer', v.ritnummer);
		p.set('halte', v.halteNaam ?? antwoord?.halte.naam ?? '');
		p.set('datum', v.tijd.gepland);
		return `/rit?${p}`;
	}
</script>

<svelte:head><title>Vertrektijden · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<h1>Vertrektijden</h1>
	<div class="kaart stapel">
		<PlekInvoer label="Halte of station" bind:waarde={halte} alleenHaltes gps={false} />
		<button class="knop tweede" onclick={buurt}><LocateFixed size={18} /> Haltes in de buurt</button>
	</div>

	{#if fout}
		<div class="melding {uitCacheVlag ? 'waarschuwing' : 'fout'}" role="alert"><TriangleAlert size={18} /> <span>{fout}</span></div>
	{/if}

	{#if antwoord}
		<section class="stapel" aria-live="polite">
			<div class="rij tussen">
				<h2>{antwoord.halte.naam}</h2>
				<button class="icoonknop" aria-label="Verversen" onclick={laad} disabled={laden}><RefreshCw size={18} class={laden ? 'draai' : ''} /></button>
			</div>
			{#if antwoord.melding}<div class="melding info klein"><Info size={16} /> <span>{antwoord.melding}</span></div>{/if}
			{#if heeftTreinen && heeftAnder}
				<div class="chips" role="group" aria-label="Filter">
					<button class="chip" aria-pressed={filter === 'alles'} onclick={() => (filter = 'alles')}>Alles</button>
					<button class="chip" aria-pressed={filter === 'trein'} onclick={() => (filter = 'trein')}>Treinen</button>
					<button class="chip" aria-pressed={filter === 'bus-tram'} onclick={() => (filter = 'bus-tram')}>Bus, tram, metro</button>
				</div>
			{/if}

			<ul class="lijst bord kaart">
				{#each lijst as v, i (i + v.tijd.gepland + v.lijn + v.richting)}
					{@const vertraging = vertragingMinuten(v.tijd)}
					<li>
						<a href={ritLink(v)} class="vertrek" class:uit={v.uitgevallen}>
							<div class="tijd-kol">
								<span class="tijd groot" class:status-vertraagd={vertraging > 0 && !v.uitgevallen}>{klok(v.uitgevallen ? v.tijd.gepland : v.tijd.verwacht)}</span>
								{#if v.uitgevallen}
									<span class="status-fout klein sterk">Vervalt</span>
								{:else if vertraging > 0}
									<span class="status-vertraagd klein sterk">+{vertraging}</span>
								{:else}
									<span class="zwak klein">{relatief(v.tijd.verwacht, nu)}</span>
								{/if}
							</div>
							<div class="midden-kol">
								<div class="rij">
									<span class="lijn" class:ns={v.isNS} style:background={!v.isNS && v.modus !== 'trein' ? v.kleur : undefined} style:color={!v.isNS && v.modus !== 'trein' && v.kleur ? (v.tekstKleur ?? '#fff') : undefined}>
										<ModusIcoon modus={v.modus} grootte={14} /> {v.lijn}
									</span>
									<strong class="richting">{v.richting}</strong>
								</div>
								<span class="zwak klein">
									{v.productNaam ?? ''}{v.vervoerder ? ` · ${v.vervoerder}` : ''}{v.via?.length ? ` · via ${v.via.slice(0, 3).join(', ')}` : ''}
								</span>
								{#if v.meldingen[0] && !v.uitgevallen}<span class="klein status-vertraagd">{v.meldingen[0].kop}</span>{/if}
							</div>
							<div class="spoor-kol">
								{#if v.spoor}
									<span class="spoor" class:gewijzigd={spoorGewijzigd(v)} aria-label="{v.modus === 'trein' ? 'spoor' : 'perron'} {v.spoor}{spoorGewijzigd(v) ? ', gewijzigd' : ''}">{v.spoor}</span>
								{/if}
								<ChevronRight size={16} class="zwak" aria-hidden="true" />
							</div>
						</a>
					</li>
				{:else}
					<li class="leeg zwak">Geen vertrekken gevonden.</li>
				{/each}
			</ul>
			{#if opgehaaldOp}
				<p class="zwak klein midden">Ververst elke 30 s · laatst om {klok(opgehaaldOp)}{uitCacheVlag ? ' (opgeslagen)' : ''}</p>
			{/if}
		</section>
	{:else if laden}
		<p class="zwak">Vertrektijden ophalen…</p>
	{:else if !halte && !inDeBuurt}
		<p class="zwak">Kies een halte of station, of bekijk de haltes bij je in de buurt.</p>
	{/if}
</main>

<style>
	.bord {
		padding: 0;
		overflow: hidden;
	}
	.bord li + li {
		border-top: 1px solid var(--rand);
	}
	.vertrek {
		display: grid;
		grid-template-columns: 62px 1fr auto;
		gap: 10px;
		align-items: center;
		padding: 12px 14px;
		color: inherit;
		text-decoration: none;
	}
	.vertrek:active {
		background: var(--kaart-2);
	}
	.vertrek.uit .richting,
	.vertrek.uit .tijd {
		text-decoration: line-through;
		color: var(--tekst-zwak);
	}
	.tijd-kol {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.tijd.groot {
		font-size: 1.2rem;
		font-weight: 750;
	}
	.sterk {
		font-weight: 750;
	}
	.midden-kol {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.richting {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lijn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--kaart-2);
		border: 1px solid var(--rand);
		font-weight: 750;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.lijn.ns {
		background: #ffc917;
		color: #0b1a4a;
		border-color: #e6b200;
	}
	.spoor-kol {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.spoor {
		min-width: 34px;
		text-align: center;
		padding: 4px 6px;
		border-radius: 8px;
		background: var(--kaart-2);
		font-weight: 800;
		font-size: 1.05rem;
	}
	.spoor.gewijzigd {
		background: var(--vertraagd-zacht);
		color: var(--vertraagd);
		outline: 2px solid var(--vertraagd);
	}
	.leeg {
		padding: 16px;
	}
	.midden {
		text-align: center;
		margin: 0;
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
