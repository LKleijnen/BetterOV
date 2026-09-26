<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { CircleX, MapPin, Navigation, TriangleAlert } from '@lucide/svelte';
	import type { GedeeldeReis } from '$lib/types';
	import { luisterNaarGedeeldeReis } from '$lib/client/data.svelte';
	import { huidigeStap } from '$lib/reis';
	import { klok, ms, relatief } from '$lib/tijd';
	import ReisTijdlijn from '$lib/components/ReisTijdlijn.svelte';
	import Aftelling from '$lib/components/Aftelling.svelte';
	import Kaart from '$lib/components/Kaart.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	let gedeeld = $state<GedeeldeReis | null>(null);
	let fout = $state<string | null>(null);
	let geladen = $state(false);
	let nu = $state(Date.now());
	let stop: (() => void) | undefined;
	const timer = setInterval(() => (nu = Date.now()), 5000);

	onMount(() => {
		// Realtime via een Firestore-listener, zonder te pollen
		stop = luisterNaarGedeeldeReis(params.id, (r, f) => {
			gedeeld = r;
			fout = f ?? null;
			geladen = true;
		});
	});
	onDestroy(() => {
		stop?.();
		clearInterval(timer);
	});

	const reis = $derived(gedeeld?.reis);
	const verlopen = $derived(!!gedeeld && ms(gedeeld.verlooptOp) < nu);
	const stap = $derived(reis ? huidigeStap(reis.advies, nu) : null);
	const locatie = $derived(gedeeld?.laatsteLocatie);
</script>

<svelte:head>
	<title>{gedeeld?.naam ? `Reis van ${gedeeld.naam}` : 'Gedeelde reis'} · BetterOV</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="pagina stapel gedeeld">
	{#if !geladen}
		<p class="zwak">Reis laden…</p>
	{:else if fout || !reis}
		<div class="kaart stapel">
			<h1>Gedeelde reis</h1>
			<p>{fout ?? 'Deze reis is niet (meer) beschikbaar.'}</p>
		</div>
	{:else}
		<header>
			<span class="zwak klein">{gedeeld?.naam ? `${gedeeld.naam} reist` : 'Reis'} naar</span>
			<h1>{reis.naar.naam}</h1>
			<p class="zwak klein">Van {reis.van.naam} · aankomst {klok(reis.advies.aankomst.verwacht)}</p>
		</header>

		{#if verlopen}
			<div class="melding info">Deze gedeelde reis is verlopen.</div>
		{:else if reis.status === 'afgerond'}
			<div class="melding ok"><Navigation size={18} /> <span>De reis is afgerond.</span></div>
		{:else if stap}
			<section class="kaart volgende" aria-live="polite">
				<span class="label">{stap.fase === 'klaar' ? 'Aangekomen' : 'Nu'}</span>
				<h2>{stap.titel}</h2>
				<p>{stap.detail}</p>
				{#if stap.fase !== 'klaar'}
					<p class="aftel"><span class="zwak">{stap.fase === 'voor' ? 'Over' : 'Nog'}</span> <strong><Aftelling doel={ms(stap.doel)} /></strong></p>
				{/if}
			</section>
		{/if}

		{#each reis.problemen ?? [] as p (p.sleutel)}
			<div class="melding {p.ernstig ? 'fout' : 'waarschuwing'}">
				{#if p.soort === 'uitval'}<CircleX size={18} />{:else}<TriangleAlert size={18} />{/if}
				<span>{p.tekst}</span>
			</div>
		{/each}

		<section class="stapel">
			<Kaart advies={reis.advies} extraPunt={locatie ? { lat: locatie.lat, lon: locatie.lng } : null} hoogte="280px" />
			<p class="rij klein zwak">
				<MapPin size={14} aria-hidden="true" />
				{#if locatie}
					Laatste locatie om {klok(locatie.tijd)} ({relatief(locatie.tijd, nu)}). Locatie wordt alleen bijgewerkt als de app van de reiziger open is.
				{:else}
					Nog geen locatie gedeeld.
				{/if}
			</p>
		</section>

		<ReisTijdlijn advies={reis.advies} actieveLeg={stap && stap.fase !== 'klaar' ? stap.legIndex : -1} />

		<p class="zwak klein">
			Bijgewerkt om {klok(reis.bijgewerktOp)} · link verloopt om {klok(gedeeld!.verlooptOp)}
		</p>
	{/if}
</main>

<style>
	.gedeeld {
		padding-bottom: calc(env(safe-area-inset-bottom) + 24px);
	}
	header h1 {
		margin: 0;
	}
	header p {
		margin: 2px 0 0;
	}
	.volgende {
		border: 2px solid var(--primair);
	}
	.volgende h2,
	.volgende p {
		margin: 2px 0;
	}
	.aftel strong {
		font-size: 2rem;
	}
</style>
