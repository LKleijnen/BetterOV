<script lang="ts">
	import { untrack } from 'svelte';
	import { Bell, BellRing, ChevronRight, House } from '@lucide/svelte';
	import { data } from '$lib/client/data.svelte';
	import { huidigePositie } from '$lib/client/gps';
	import { onthoudAdvies } from '$lib/client/planner.svelte';
	import { pushStatus } from '$lib/client/push';
	import { haalWekker, isAvond, laatsteNaarHuis, wisWekker, zetWekker, type LaatsteAntwoord } from '$lib/client/reisacties';
	import { afstandMeter } from '$lib/geo';
	import { duurTekst, klok } from '$lib/tijd';

	// Verschijnt vanzelf: 's avonds, als je ver van huis bent en locatie al mag. Uit te zetten in Instellingen.
	const VER_METER = 3000;
	const CACHE_MS = 10 * 60000;

	let antwoord = $state<LaatsteAntwoord | null>(null);
	let wekkerAan = $state(false);
	let wekkerBezig = $state(false);
	let melding = $state<string | null>(null);
	let geprobeerd = false;

	$effect(() => {
		const thuis = data.profiel.thuislocatie;
		const uit = data.profiel.laatsteTrein === 'uit';
		if (!data.geladen || !thuis || uit || geprobeerd) return;
		geprobeerd = true;
		untrack(() => void laad(thuis.lat, thuis.lon));
	});

	async function locatieMag(): Promise<boolean> {
		try {
			return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted';
		} catch {
			return false;
		}
	}

	async function laad(thuisLat: number, thuisLon: number) {
		if (!isAvond() || !(await locatieMag())) return;
		try {
			const p = await huidigePositie(8000, 5 * 60000);
			if (afstandMeter(p.lat, p.lon, thuisLat, thuisLon) < VER_METER) return;
			const sleutel = `laatste:${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
			const oud = leesSessie<{ a: LaatsteAntwoord; t: number }>(sleutel);
			const a = oud && Date.now() - oud.t < CACHE_MS ? oud.a : await laatsteNaarHuis();
			if (!oud || oud.a !== a) schrijfSessie(sleutel, { a, t: Date.now() });
			if (a.advies) onthoudAdvies(a.advies, a.van, a.naar);
			antwoord = a;
			const w = await haalWekker().catch(() => null);
			wekkerAan = !!w && !!a.advies && w.advies.id === a.advies.id;
		} catch {
			// Geen locatie of geen verbinding: dan tonen we niets
		}
	}

	async function wisselWekker() {
		if (!antwoord?.advies) return;
		wekkerBezig = true;
		melding = null;
		try {
			if (wekkerAan) {
				await wisWekker();
				wekkerAan = false;
			} else {
				const push = await zetWekker({ advies: antwoord.advies, van: antwoord.van, naar: antwoord.naar });
				wekkerAan = true;
				if (!push) melding = 'Meldingen op de achtergrond zijn nog niet ingesteld.';
				else if (pushStatus() !== 'aan') melding = 'Zet meldingen aan in Instellingen, anders krijg je de waarschuwing niet.';
				else melding = 'Je krijgt een melding 30 en 10 minuten voordat je moet vertrekken.';
			}
		} catch (e) {
			melding = (e as Error).message;
		} finally {
			wekkerBezig = false;
		}
	}

	function leesSessie<T>(k: string): T | null {
		try {
			return JSON.parse(sessionStorage.getItem(k) ?? 'null') as T | null;
		} catch {
			return null;
		}
	}

	function schrijfSessie(k: string, v: unknown) {
		try {
			sessionStorage.setItem(k, JSON.stringify(v));
		} catch {
			// negeren
		}
	}

	const speling = $derived(antwoord?.advies ? Math.floor((Date.parse(antwoord.advies.vertrek.verwacht) - Date.now()) / 60000) : null);
</script>

{#if antwoord}
	<section class="kaart laatste" class:krap={speling !== null && speling < 15} aria-labelledby="laatste-kop">
		<h2 id="laatste-kop" class="rij klein"><House size={16} aria-hidden="true" /> Laatste trein naar huis</h2>
		{#if antwoord.advies && speling !== null}
			<a class="rij tussen regel" href="/advies/{antwoord.advies.id}">
				<span>
					Vertrek uiterlijk <strong class="tijd">{klok(antwoord.advies.vertrek.verwacht)}</strong>
					<span class="zwak">· nog {duurTekst(Math.max(0, speling) * 60)}</span><br />
					<span class="zwak klein">Thuis om {klok(antwoord.advies.aankomst.verwacht)}</span>
				</span>
				<ChevronRight size={18} aria-hidden="true" />
			</a>
			<button type="button" class="knop klein" class:tweede={!wekkerAan} aria-pressed={wekkerAan} onclick={wisselWekker} disabled={wekkerBezig}>
				{#if wekkerAan}<BellRing size={16} /> Waarschuwing staat aan{:else}<Bell size={16} /> Waarschuw mij{/if}
			</button>
			{#if melding}<p class="zwak klein">{melding}</p>{/if}
		{:else}
			<p class="klein">{antwoord.melding ?? 'Er gaat vannacht geen verbinding meer naar huis.'}</p>
		{/if}
	</section>
{/if}

<style>
	.laatste {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-color: var(--primair);
	}
	.laatste.krap {
		border-color: var(--fout);
		background: var(--fout-zacht);
	}
	h2 {
		margin: 0;
		gap: 6px;
		color: var(--tekst-zwak);
	}
	.regel {
		color: inherit;
		text-decoration: none;
	}
	.tijd {
		font-size: 1.15rem;
	}
	p {
		margin: 0;
	}
</style>
