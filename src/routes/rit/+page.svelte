<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { ChevronLeft, TrainFront, TriangleAlert, Map as KaartIcoon } from '@lucide/svelte';
	import type { Advies, Leg, VoertuigPositie } from '$lib/types';
	import { api } from '$lib/client/api';
	import { legNaam } from '$lib/reis';
	import { klok } from '$lib/tijd';
	import { geschattePositie } from '$lib/voertuig';
	import { legLijnOverSpoor } from '$lib/client/spoorkaart';
	import Tijd from '$lib/components/Tijd.svelte';
	import LijnLabel from '$lib/components/LijnLabel.svelte';
	import Onderblad from '$lib/components/Onderblad.svelte';
	import VoertuigPaneel from '$lib/components/VoertuigPaneel.svelte';
	import Kaart from '$lib/components/Kaart.svelte';

	const tripId = page.url.searchParams.get('tripId') ?? '';
	const ritnummer = page.url.searchParams.get('ritnummer') ?? '';
	const halteNaam = page.url.searchParams.get('halte') ?? '';
	const datum = page.url.searchParams.get('datum') ?? '';

	let leg = $state<Leg | null>(null);
	let fout = $state<string | null>(null);
	let opgehaaldOp = $state<string | null>(null);
	let voertuigOpen = $state(false);
	let kaartOpen = $state(false);
	let positie = $state<VoertuigPositie | null>(null);
	let timer: ReturnType<typeof setInterval> | undefined;

	async function laad() {
		const p = new URLSearchParams();
		if (tripId) p.set('tripId', tripId);
		if (ritnummer) p.set('ritnummer', ritnummer);
		if (datum) p.set('datum', datum);
		try {
			const r = await api<{ leg: Leg; opgehaaldOp: string }>(`/api/rit?${p}`, { timeoutMs: 12000 });
			leg = r.leg;
			opgehaaldOp = r.opgehaaldOp;
			fout = null;
			await werkPositieBij();
		} catch (e) {
			fout = (e as Error).message;
		}
	}

	async function werkPositieBij() {
		if (!leg) return;
		if (leg.isNS && leg.ritnummer) {
			const gps = await api<VoertuigPositie | null>(`/api/voertuig?ritnummer=${leg.ritnummer}`).catch(() => null);
			if (gps) {
				positie = gps;
				return;
			}
		}
		positie = geschattePositie(leg, Date.now(), await legLijnOverSpoor(leg));
	}

	onMount(() => {
		void laad();
		timer = setInterval(() => document.visibilityState === 'visible' && void laad(), 30000);
	});
	onDestroy(() => clearInterval(timer));

	const haltes = $derived(leg ? [leg.van, ...leg.tussenstops, leg.naar] : []);
	const advies = $derived<Advies | null>(
		leg
			? { id: 'rit', bron: 'transitous', vertrek: leg.vertrek, aankomst: leg.aankomst, duur: leg.duur, overstappen: 0, legs: [leg] }
			: null
	);
	const nu = Date.now();
</script>

<svelte:head><title>Rit · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<button class="icoonknop" aria-label="Terug" onclick={() => history.back()}><ChevronLeft size={22} /></button>
		<h1 class="kop">{leg ? `${legNaam(leg)} naar ${leg.richting ?? leg.naar.naam}` : 'Rit'}</h1>
	</div>

	{#if fout}
		<div class="melding fout"><TriangleAlert size={18} /> <span>{fout}</span></div>
	{/if}

	{#if leg}
		<div class="rij" style="flex-wrap: wrap">
			<LijnLabel {leg} />
			{#if leg.vervoerder}<span class="zwak">{leg.vervoerder}</span>{/if}
			{#if leg.ritnummer}<span class="zwak">rit {leg.ritnummer}</span>{/if}
		</div>
		{#if leg.uitgevallen}<div class="melding fout"><TriangleAlert size={18} /> <span>Deze rit rijdt niet.</span></div>{/if}
		{#each leg.meldingen.slice(0, 3) as m, i (i)}
			<div class="melding waarschuwing klein"><TriangleAlert size={16} /> <span><strong>{m.kop}</strong>{m.tekst ? ` ${m.tekst}` : ''}</span></div>
		{/each}

		<div class="rij acties">
			<button class="knop tweede klein" onclick={() => (voertuigOpen = true)}><TrainFront size={18} /> {leg.isNS ? 'Trein & instapadvies' : 'Voertuiginfo'}</button>
			<button class="knop tweede klein" onclick={() => { void werkPositieBij(); kaartOpen = true; }}><KaartIcoon size={18} /> Live positie</button>
		</div>

		<ol class="lijst kaart haltes">
			{#each haltes as h, i (i)}
				{@const t = h.vertrek ?? h.aankomst}
				{@const voorbij = !!t && Date.parse(t.verwacht) < nu}
				<li class="halte" class:hier={h.naam === halteNaam} class:voorbij class:uit={h.uitgevallen}>
					<span class="tijdje"><Tijd tijd={i === 0 ? leg.vertrek : i === haltes.length - 1 ? leg.aankomst : t} uitgevallen={h.uitgevallen} /></span>
					<span class="punt" aria-hidden="true"></span>
					<span class="naam">{h.naam}{#if h.uitgevallen} <span class="status-fout klein">vervalt</span>{/if}</span>
					{#if h.spoor}<span class="spoor zwak klein">{leg.modus === 'trein' ? 'sp.' : ''} {h.spoor}</span>{/if}
				</li>
			{/each}
		</ol>
		{#if opgehaaldOp}<p class="zwak klein">Bijgewerkt om {klok(opgehaaldOp)}</p>{/if}
	{:else if !fout}
		<p class="zwak">Rit ophalen…</p>
	{/if}
</main>

<Onderblad bind:open={voertuigOpen} titel="Voertuiginfo">
	{#if leg}<VoertuigPaneel {leg} />{/if}
</Onderblad>

<Onderblad bind:open={kaartOpen} titel="Live positie">
	{#if advies}
		<Kaart {advies} voertuig={positie} hoogte="60dvh" />
		<p class="klein zwak">
			{positie?.soort === 'gps' ? 'GPS-positie van de trein (NS).' : 'Geschatte positie op basis van de actuele dienstregeling.'}
		</p>
	{/if}
</Onderblad>

<style>
	.kop {
		font-size: 1.15rem;
		margin: 0;
	}
	.acties {
		gap: 8px;
		flex-wrap: wrap;
	}
	.haltes {
		padding: 8px 14px;
	}
	.halte {
		display: grid;
		grid-template-columns: 62px 14px 1fr auto;
		gap: 8px;
		align-items: center;
		min-height: 40px;
	}
	.halte.voorbij {
		opacity: 0.55;
	}
	.halte.hier .naam {
		font-weight: 750;
	}
	.halte.hier .punt {
		background: var(--primair);
		border-color: var(--primair);
	}
	.halte.uit .naam {
		text-decoration: line-through;
	}
	.punt {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 3px solid var(--tekst);
		background: var(--kaart);
	}
</style>
