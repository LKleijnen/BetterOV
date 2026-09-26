<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronLeft, House, LocateFixed, MapPin, Search, Star, History, TrainFront, Bus, X } from '@lucide/svelte';
	import type { Plek } from '$lib/types';
	import { api } from '$lib/client/api';
	import { data } from '$lib/client/data.svelte';
	import { huidigePositie, laatstePositie } from '$lib/client/gps';
	import { recentePlekken } from '$lib/client/planner.svelte';

	let {
		label,
		waarde = $bindable(),
		placeholder = 'Adres, halte of station',
		alleenHaltes = false,
		gps = true,
		wisbaar = false
	}: {
		label: string;
		waarde: Plek | null;
		placeholder?: string;
		alleenHaltes?: boolean;
		gps?: boolean;
		wisbaar?: boolean;
	} = $props();

	let open = $state(false);
	let tekst = $state('');
	let resultaten = $state<Plek[]>([]);
	let zoeken = $state(false);
	let fout = $state<string | null>(null);
	let invoer = $state<HTMLInputElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let volgnummer = 0;

	const id = `plek-${Math.random().toString(36).slice(2, 8)}`;

	async function openen() {
		open = true;
		tekst = '';
		resultaten = [];
		fout = null;
		await tick();
		invoer?.focus();
	}

	function sluiten() {
		open = false;
		clearTimeout(timer);
	}

	function kies(p: Plek) {
		waarde = p;
		sluiten();
	}

	function opInvoer() {
		clearTimeout(timer);
		fout = null;
		if (tekst.trim().length < 2) {
			resultaten = [];
			return;
		}
		timer = setTimeout(zoek, 250);
	}

	async function zoek() {
		const mijn = ++volgnummer;
		zoeken = true;
		try {
			const pos = laatstePositie();
			const qs = new URLSearchParams({ q: tekst.trim() });
			if (pos) {
				qs.set('lat', String(pos.lat));
				qs.set('lon', String(pos.lon));
			}
			const r = await api<Plek[]>(`/api/zoek?${qs}`, { timeoutMs: 8000 });
			if (mijn !== volgnummer) return;
			resultaten = alleenHaltes ? r.filter((p) => p.type === 'halte' || p.type === 'station') : r;
		} catch (e) {
			if (mijn === volgnummer) fout = (e as Error).message;
		} finally {
			if (mijn === volgnummer) zoeken = false;
		}
	}

	let gpsBezig = $state(false);
	async function huidigeLocatie() {
		gpsBezig = true;
		fout = null;
		try {
			const p = await huidigePositie();
			let naam = 'Huidige locatie';
			try {
				const adres = await api<Plek | null>(`/api/omgekeerd?lat=${p.lat}&lon=${p.lon}`, { timeoutMs: 4000 });
				if (adres?.naam) naam = `Huidige locatie (${adres.naam})`;
			} catch {
				// naam blijft algemeen
			}
			kies({ naam, lat: p.lat, lon: p.lon, type: 'gps' });
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			gpsBezig = false;
		}
	}

	const recent = $derived(open ? recentePlekken().filter((p) => !alleenHaltes || p.stopId) : []);
	const favorietePlekken = $derived(data.plekken.filter((p) => !alleenHaltes || p.plek.stopId));
	const thuis = $derived(!alleenHaltes ? data.profiel.thuislocatie : undefined);

	function toets(e: KeyboardEvent) {
		if (e.key === 'Escape') sluiten();
	}
</script>

<div class="plekveld">
	<span class="label" id="{id}-label">{label}</span>
	<div class="rij">
		<button type="button" class="waarde" aria-labelledby="{id}-label {id}-knop" id="{id}-knop" onclick={openen}>
			{#if waarde}
				<span class="naam">{waarde.naam}</span>
				{#if waarde.omschrijving}<span class="oms zwak">{waarde.omschrijving}</span>{/if}
			{:else}
				<span class="zwak">{placeholder}</span>
			{/if}
		</button>
		{#if wisbaar && waarde}
			<button type="button" class="icoonknop wis" aria-label="{label} wissen" onclick={() => (waarde = null)}><X size={18} /></button>
		{/if}
	</div>
</div>

{#if open}
	<div class="overlay" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" onkeydown={toets}>
		<div class="kop">
			<button type="button" class="icoonknop" aria-label="Terug" onclick={sluiten}><ChevronLeft size={22} /></button>
			<div class="zoekveld">
				<Search size={18} aria-hidden="true" />
				<input
					bind:this={invoer}
					bind:value={tekst}
					oninput={opInvoer}
					type="search"
					enterkeyhint="search"
					autocomplete="off"
					autocorrect="off"
					spellcheck="false"
					placeholder={alleenHaltes ? 'Halte of station' : placeholder}
					aria-label={label}
				/>
			</div>
		</div>
		<ul class="lijst suggesties">
			{#if tekst.trim().length < 2}
				{#if gps}
					<li>
						<button type="button" onclick={huidigeLocatie} disabled={gpsBezig}>
							<LocateFixed size={20} aria-hidden="true" />
							<span>{gpsBezig ? 'Locatie bepalen…' : 'Huidige locatie'}</span>
						</button>
					</li>
				{/if}
				{#if thuis}
					<li>
						<button type="button" onclick={() => kies(thuis)}>
							<House size={20} aria-hidden="true" /><span>Thuis <span class="zwak klein">{thuis.naam}</span></span>
						</button>
					</li>
				{/if}
				{#each favorietePlekken as p (p.id)}
					<li>
						<button type="button" onclick={() => kies({ ...p.plek, naam: p.plek.naam })}>
							<Star size={20} aria-hidden="true" /><span>{p.naam} <span class="zwak klein">{p.plek.naam}</span></span>
						</button>
					</li>
				{/each}
				{#each recent as p (p.naam + p.lat)}
					<li>
						<button type="button" onclick={() => kies(p)}>
							<History size={20} aria-hidden="true" /><span>{p.naam}{#if p.omschrijving}<span class="zwak klein"> {p.omschrijving}</span>{/if}</span>
						</button>
					</li>
				{/each}
			{:else}
				{#each resultaten as p (p.naam + p.lat + p.lon)}
					<li>
						<button type="button" onclick={() => kies(p)}>
							{#if p.type === 'station'}<TrainFront size={20} aria-hidden="true" />{:else if p.type === 'halte'}<Bus size={20} aria-hidden="true" />{:else}<MapPin size={20} aria-hidden="true" />{/if}
							<span>{p.naam}{#if p.omschrijving}<span class="zwak klein"> {p.omschrijving}</span>{/if}</span>
						</button>
					</li>
				{/each}
				{#if zoeken && resultaten.length === 0}
					<li class="zwak leeg">Zoeken…</li>
				{:else if !zoeken && resultaten.length === 0 && !fout}
					<li class="zwak leeg">Niets gevonden.</li>
				{/if}
			{/if}
			{#if fout}<li class="leeg status-fout">{fout}</li>{/if}
		</ul>
	</div>
{/if}

<style>
	.plekveld {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.waarde {
		appearance: none;
		flex: 1;
		min-width: 0;
		min-height: 52px;
		text-align: left;
		padding: 8px 12px;
		border-radius: 12px;
		border: 1px solid var(--rand);
		background: var(--kaart);
		color: var(--tekst);
		font: inherit;
		display: flex;
		flex-direction: column;
		justify-content: center;
		cursor: pointer;
	}
	.naam {
		font-weight: 650;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.oms {
		font-size: 0.82rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.wis {
		flex: 0 0 auto;
	}
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		padding-top: env(safe-area-inset-top);
	}
	.kop {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--rand);
		max-width: var(--max-breedte);
		width: 100%;
		margin: 0 auto;
	}
	.zoekveld {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border-radius: 12px;
		border: 1px solid var(--rand);
		background: var(--kaart);
		color: var(--tekst-zwak);
	}
	.zoekveld input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--tekst);
		font: inherit;
		font-size: 1.05rem;
		min-height: 44px;
	}
	.suggesties {
		overflow-y: auto;
		max-width: var(--max-breedte);
		width: 100%;
		margin: 0 auto;
		padding: 8px 8px calc(env(safe-area-inset-bottom) + 16px);
	}
	.suggesties button {
		appearance: none;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		padding: 8px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--tekst);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.suggesties button:hover,
	.suggesties button:focus-visible {
		background: var(--kaart-2);
	}
	.suggesties button :global(svg) {
		flex: 0 0 auto;
		color: var(--tekst-zwak);
	}
	.leeg {
		padding: 16px 8px;
	}
</style>
