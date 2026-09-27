<script lang="ts">
	import { untrack } from 'svelte';
	import { ArrowLeft, ArrowRight, VolumeX } from '@lucide/svelte';
	import type { Drukte as DrukteType, TreinDeel, TreinInfo } from '$lib/types';
	import BakVak from './BakVak.svelte';
	import Drukte from './Drukte.svelte';

	let { info }: { info: TreinInfo } = $props();

	// De trein zoals hij langs het perron staat, in de volgorde van NS, met de rijrichting erboven.
	// Boven: de hele trein in het klein, met haakjes per bestemming als hij splitst.
	// Onder: de bakken groot (afbeelding van NS), horizontaal te scrollen.

	interface Bak {
		sleutel: string;
		eersteKlas: boolean;
		stilte: boolean;
		drukte?: DrukteType;
		afbeelding?: string;
	}
	interface Deel {
		i: number;
		deel: TreinDeel;
		bakken: Bak[];
		stilteErgens: boolean;
		eersteErgens: boolean;
		jouw: boolean;
	}
	interface Groep {
		naar?: string;
		delen: Deel[];
		aantal: number;
		jouw: boolean;
	}

	const HOOGTE = 34;

	const richting = $derived(info.instapadvies?.rijrichting);
	const jouwDelen = $derived(new Set(info.splitsing?.voorUitstappen ? info.splitsing.jouwDelen : []));

	const delen = $derived.by((): Deel[] => {
		const totaal = info.delen.reduce((s, d) => s + Math.max(1, d.bakken), 0);
		let pos = 0;
		return info.delen.map((d, i) => {
			const n = Math.max(1, d.bakken);
			const perBak = d.indeling?.length === n ? d.indeling : undefined;
			const bakken = Array.from({ length: n }, (_, j): Bak => {
				const midden = (pos + j + 0.5) / totaal;
				const binnen = (r?: { van: number; tot: number }[]) => !!r?.some((x) => midden >= x.van && midden <= x.tot);
				const b = perBak?.[j];
				return {
					sleutel: `${i}-${j}`,
					eersteKlas: b ? b.eersteKlas : binnen(info.instapadvies?.eersteKlas),
					stilte: b ? b.stilte : binnen(info.instapadvies?.stilte),
					drukte: b?.drukte && b.drukte !== 'onbekend' ? b.drukte : undefined,
					afbeelding: d.bakAfbeeldingen?.length === n ? d.bakAfbeeldingen[j] : undefined
				};
			});
			pos += n;
			return {
				i,
				deel: d,
				bakken,
				stilteErgens: !bakken.some((b) => b.stilte) && d.faciliteiten.some((f) => f.includes('STILTE')),
				eersteErgens: !bakken.some((b) => b.eersteKlas) && !!d.eersteKlas,
				jouw: jouwDelen.has(i)
			};
		});
	});

	// Aaneengesloten treinstellen met dezelfde bestemming vormen één groep, met één haakje eronder
	const groepen = $derived.by((): Groep[] => {
		const uit: Groep[] = [];
		for (const d of delen) {
			const naar = info.splitsing?.bestemmingen.find((b) => b.deel === d.i)?.naar ?? d.deel.eindbestemming;
			const vorige = uit.at(-1);
			if (vorige && vorige.naar === naar) {
				vorige.delen.push(d);
				vorige.aantal += d.bakken.length;
				vorige.jouw ||= d.jouw;
			} else uit.push({ naar, delen: [d], aantal: d.bakken.length, jouw: d.jouw });
		}
		return uit;
	});
	const splitst = $derived(new Set(groepen.map((g) => g.naar).filter(Boolean)).size > 1);
	const heeftDrukte = $derived(delen.some((d) => d.bakken.some((b) => b.drukte)));
	const heeftKenmerken = $derived(delen.some((d) => d.bakken.some((b) => b.eersteKlas || b.stilte)));
	// Eén afbeelding van het hele treinstel (geen afbeelding per bak): die tonen we in zijn geheel
	let kapot = $state<Record<number, boolean>>({});
	const heelBeeld = (d: Deel) => !d.bakken[0]?.afbeelding && !!d.deel.afbeelding && !kapot[d.i];

	// ---------- Scrollen ----------
	let strook = $state<HTMLDivElement>();
	let venster = $state({ links: 0, breedte: 1, kanLinks: false, kanRechts: false });
	let zelfGescrolld = false;
	const begin = Date.now();

	function meet() {
		if (!strook) return;
		const { scrollLeft, scrollWidth, clientWidth } = strook;
		venster = {
			links: scrollLeft / scrollWidth,
			breedte: Math.min(1, clientWidth / scrollWidth),
			kanLinks: scrollLeft > 2,
			kanRechts: scrollLeft + clientWidth < scrollWidth - 2
		};
	}
	const scrollbaar = $derived(venster.breedte < 0.98);

	function centreer(el: HTMLElement | null | undefined, soepel: boolean) {
		if (!strook || !el) return;
		const links = el.offsetWidth > strook.clientWidth ? el.offsetLeft - 8 : el.offsetLeft + el.offsetWidth / 2 - strook.clientWidth / 2;
		strook.scrollTo({ left: Math.max(0, links), behavior: soepel ? 'smooth' : 'instant' });
	}

	// Begin bij jouw deel als de trein splitst
	function beginPositie() {
		if (zelfGescrolld || Date.now() - begin > 2000) return;
		const jouw = delen.find((d) => d.jouw);
		if (jouw) centreer(strook?.querySelector<HTMLElement>(`[data-deel="${jouw.i}"]`), false);
		meet();
	}

	function geladen() {
		meet();
		beginPositie();
	}

	$effect(() => {
		if (!strook) return;
		const ro = new ResizeObserver(() => meet());
		ro.observe(strook);
		untrack(beginPositie);
		return () => ro.disconnect();
	});

	function bakLabel(bak: Bak, j: number, n: number): string {
		const tekst = [`Bak ${j + 1} van ${n}`];
		if (bak.eersteKlas) tekst.push('eerste klas');
		if (bak.stilte) tekst.push('stiltecoupé');
		if (bak.drukte) tekst.push(bak.drukte === 'hoog' ? 'druk' : bak.drukte === 'gemiddeld' ? 'gemiddeld druk' : 'rustig');
		return tekst.join(', ');
	}
	const deelNaam = (d: TreinDeel) => [d.type ?? 'Treinstel', d.nummer].filter(Boolean).join(' · ');
</script>

{#snippet kenmerken(bak: Bak)}
	{#if bak.eersteKlas}<span class="een">1</span>{/if}
	{#if bak.stilte}<VolumeX size={14} aria-hidden="true" />{/if}
{/snippet}

{#snippet haak()}
	<svg class="kap" viewBox="0 0 8 10" aria-hidden="true"><path d="M1 0 Q1 5 8 5" /></svg>
	<span class="lijn"></span>
	<svg class="punt" viewBox="0 0 12 10" aria-hidden="true"><path d="M0 5 Q6 5 6 10 Q6 5 12 5" /></svg>
	<span class="lijn"></span>
	<svg class="kap" viewBox="0 0 8 10" aria-hidden="true"><path d="M0 5 Q7 5 7 0" /></svg>
{/snippet}

<figure class="trein">
	{#if richting}
		<div class="richting klein zwak" class:rechts={richting === 'rechts'}>
			{#if richting === 'links'}<ArrowLeft size={15} aria-hidden="true" /> Rijrichting{:else}Rijrichting <ArrowRight size={15} aria-hidden="true" />{/if}
		</div>
	{/if}

	{#if scrollbaar || splitst}
		<div class="overzicht">
			{#if scrollbaar}
				<div class="venster" aria-hidden="true" style:left="{venster.links * 100}%" style:width="{venster.breedte * 100}%"></div>
			{/if}
			{#each groepen as g, gi (gi)}
				<div class="groep" style:flex-grow={g.aantal}>
					<div class="mini" aria-hidden="true">
						{#each g.delen as d (d.i)}
							<div class="minideel" style:flex-grow={d.bakken.length}>
								{#each d.bakken as bak (bak.sleutel)}
									<button
										type="button"
										tabindex="-1"
										class="blok"
										class:eerste={bak.eersteKlas}
										onclick={() => centreer(strook?.querySelector<HTMLElement>(`[data-bak="${bak.sleutel}"]`), true)}
									>
										{#if bak.stilte}<VolumeX size={9} strokeWidth={3} />{/if}
									</button>
								{/each}
							</div>
						{/each}
					</div>
					{#if splitst}
						<div class="haak" class:jouw={g.jouw}>{@render haak()}</div>
						<div class="bestemming klein" class:jouw={g.jouw}>
							<span>{g.naar ?? ''}</span>
							{#if g.jouw}<span class="jouwlabel">Jouw deel</span>{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="strook"
		class:kan-links={venster.kanLinks}
		class:kan-rechts={venster.kanRechts}
		bind:this={strook}
		onscroll={meet}
		onpointerdown={() => (zelfGescrolld = true)}
		onwheel={() => (zelfGescrolld = true)}
		aria-label="Opstelling van de trein op het perron"
		role="group"
	>
		{#each delen as d (d.i)}
			<div class="deel" class:jouw={d.jouw} data-deel={d.i}>
				{#if heelBeeld(d)}
					<div class="kolommen">
						{#each d.bakken as bak, j (bak.sleutel)}
							<div class="kenmerken" class:leeg={!heeftKenmerken} data-bak={bak.sleutel} role="img" aria-label={bakLabel(bak, j, d.bakken.length)}>{@render kenmerken(bak)}</div>
						{/each}
					</div>
					<img class="geheel" src={d.deel.afbeelding} alt="" style:height="{HOOGTE}px" onload={geladen} onerror={() => (kapot[d.i] = true)} />
					{#if heeftDrukte}
						<div class="kolommen">
							{#each d.bakken as bak (bak.sleutel)}<div class="druk">{#if bak.drukte}<Drukte drukte={bak.drukte} tekst={false} />{/if}</div>{/each}
						</div>
					{/if}
				{:else}
					<div class="bakken">
						{#each d.bakken as bak, j (bak.sleutel)}
							<div class="bak" data-bak={bak.sleutel} role="img" aria-label={bakLabel(bak, j, d.bakken.length)}>
								{#if heeftKenmerken}<div class="kenmerken">{@render kenmerken(bak)}</div>{/if}
								<BakVak
									afbeelding={bak.afbeelding}
									eersteKlas={bak.eersteKlas}
									kop={d.bakken.length === 1 ? 'beide' : j === 0 ? 'links' : j === d.bakken.length - 1 ? 'rechts' : undefined}
									hoogte={HOOGTE}
									onload={geladen}
								/>
								{#if heeftDrukte}<div class="druk">{#if bak.drukte}<Drukte drukte={bak.drukte} tekst={false} />{/if}</div>{/if}
							</div>
						{/each}
					</div>
				{/if}
				<div class="deelnaam klein">
					{#if d.jouw}<span class="jouwlabel">Jouw deel</span>{/if}
					<span class="zwak">{deelNaam(d.deel)}</span>
					{#if d.eersteErgens || d.stilteErgens}
						<span class="zwak ergens">
							{#if d.eersteErgens}<span class="een klein-een">1</span>{/if}{#if d.stilteErgens}<VolumeX size={12} aria-label="stilte" />{/if} in dit treinstel
						</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</figure>

<style>
	.trein {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.richting {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.richting.rechts {
		justify-content: flex-end;
	}

	/* ---------- Overzicht ---------- */
	.overzicht {
		position: relative;
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.groep {
		flex-basis: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.mini {
		display: flex;
		gap: 3px;
	}
	.minideel {
		flex-basis: 0;
		min-width: 0;
		display: flex;
		gap: 2px;
	}
	.blok {
		flex: 1 1 0;
		min-width: 0;
		height: 16px;
		padding: 0;
		border: 0;
		border-radius: 3px;
		background: var(--kaart-2);
		box-shadow: inset 0 0 0 1px var(--rand);
		color: var(--tekst-zwak);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.blok.eerste {
		background: #ffc917;
		box-shadow: inset 0 0 0 1px #e6b200;
		color: #0b1a4a;
	}
	.venster {
		position: absolute;
		top: -3px;
		height: 22px;
		border: 2px solid var(--primair);
		border-radius: 6px;
		pointer-events: none;
		transition: left 0.08s linear;
	}
	.haak {
		display: flex;
		align-items: flex-start;
		height: 10px;
		margin: 4px 1px 0;
		color: var(--tekst-zwak);
	}
	.haak.jouw {
		color: var(--ok);
	}
	.haak svg {
		flex: 0 0 auto;
		height: 10px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		overflow: visible;
	}
	.haak .kap {
		width: 8px;
	}
	.haak .punt {
		width: 12px;
	}
	.haak .lijn {
		flex: 1 1 0;
		height: 4px;
		border-bottom: 2px solid currentColor;
	}
	.bestemming {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		margin-top: 3px;
		text-align: center;
		font-weight: 650;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.bestemming.jouw {
		color: var(--ok);
	}

	/* ---------- Grote strook ---------- */
	.strook {
		position: relative;
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding: 2px 2px 6px;
		scrollbar-width: thin;
	}
	.strook.kan-rechts {
		mask-image: linear-gradient(to right, #000 88%, transparent);
	}
	.strook.kan-links {
		mask-image: linear-gradient(to right, transparent, #000 12%);
	}
	.strook.kan-links.kan-rechts {
		mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
	}
	.deel {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		border-radius: 8px;
	}
	.deel.jouw {
		background: var(--ok-zacht);
	}
	.bakken {
		display: flex;
		gap: 2px;
		align-items: flex-end;
	}
	.bak {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.kolommen {
		display: flex;
	}
	.kolommen > * {
		flex: 1 1 0;
	}
	.kenmerken {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: 18px;
	}
	.kenmerken.leeg {
		height: 0;
	}
	.druk {
		display: flex;
		justify-content: center;
		height: 16px;
	}
	.geheel {
		display: block;
		width: auto;
		min-width: 60px;
	}
	.deelnaam {
		/* Het label bepaalt de breedte niet: dat doen de bakken */
		width: 0;
		min-width: 100%;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px 6px;
		margin-top: 2px;
	}
	.ergens {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.een {
		display: inline-flex;
		width: 17px;
		height: 17px;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		background: #ffc917;
		color: #0b1a4a;
		font-weight: 800;
		font-size: 0.78rem;
	}
	.klein-een {
		width: 14px;
		height: 14px;
		font-size: 0.68rem;
	}
	.jouwlabel {
		flex: 0 0 auto;
		padding: 1px 7px;
		border-radius: 6px;
		background: var(--ok);
		color: var(--bg);
		font-weight: 750;
		font-size: 0.72rem;
	}
</style>
