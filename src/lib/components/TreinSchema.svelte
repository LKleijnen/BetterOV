<script lang="ts">
	import { untrack } from 'svelte';
	import { ArrowLeft, ArrowRight, VolumeX } from '@lucide/svelte';
	import type { Drukte as DrukteType, TreinDeel, TreinInfo } from '$lib/types';
	import { LEEFTIJD_NAMEN } from '$lib/materieel';
	import { bakkenUitNummer, treinVariant, vasteIndeling, type Variant, type Zekerheid } from '$lib/treinvariant';
	import BakVak from './BakVak.svelte';
	import Drukte from './Drukte.svelte';

	let { info }: { info: TreinInfo } = $props();

	// De trein zoals hij langs het perron staat, in de volgorde van NS, met de rijrichting erboven.
	// De bakken liggen naast elkaar (afbeelding van NS) en zijn horizontaal te scrollen; daaronder een
	// rij streepjes, één per bak, die laat zien welk stuk je ziet. Splitst de trein, dan staat onder
	// elk deel een haakje met de bestemming.

	interface Bak {
		sleutel: string;
		/** 'ja': zeker in deze bak; 'misschien': in deze of een andere bak, afhankelijk van hoe de trein staat */
		eersteKlas?: Zekerheid;
		stilte?: Zekerheid;
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
		variant?: Variant;
		moderner: boolean;
		/** Toon bij dit treinstel wat voor versie het is (één keer per versie) */
		uitleg: boolean;
	}
	interface Groep {
		naar?: string;
		delen: Deel[];
		jouw: boolean;
	}

	const HOOGTE = 34;

	const richting = $derived(info.instapadvies?.rijrichting);
	const jouwDelen = $derived(new Set(info.splitsing?.voorUitstappen ? info.splitsing.jouwDelen : []));

	const delen = $derived.by((): Deel[] => {
		const lijst = info.delen.map((d, i) => {
			const n = Math.max(1, d.bakken || bakkenUitNummer(d.type ?? info.type, d.nummer) || 1);
			const perBak = d.indeling?.length === n ? d.indeling : undefined;
			const heeftStilte = d.faciliteiten.some((f) => f.includes('STILTE'));
			// Per bak van NS als die het zegt, anders de vaste indeling van het type
			const vast = vasteIndeling(d.type ?? info.type, n, heeftStilte, info.vervoerder);
			const nsKlasse = !!perBak?.some((b) => b.eersteKlas);
			const nsStilte = !!perBak?.some((b) => b.stilte);
			const bakken = Array.from({ length: n }, (_, j): Bak => {
				const b = perBak?.[j];
				return {
					sleutel: `${i}-${j}`,
					eersteKlas: nsKlasse ? (b?.eersteKlas ? 'ja' : undefined) : vast?.[j].eersteKlas,
					stilte: nsStilte ? (b?.stilte ? 'ja' : undefined) : vast?.[j].stilte,
					drukte: b?.drukte && b.drukte !== 'onbekend' ? b.drukte : undefined,
					afbeelding: d.bakAfbeeldingen?.length === n ? d.bakAfbeeldingen[j] : undefined
				};
			});
			return {
				i,
				deel: d,
				bakken,
				stilteErgens: !bakken.some((b) => b.stilte) && heeftStilte,
				eersteErgens: !bakken.some((b) => b.eersteKlas) && !!d.eersteKlas,
				jouw: jouwDelen.has(i),
				variant: treinVariant(d.type ?? info.type, d.nummer, info.vervoerder),
				moderner: false,
				uitleg: false
			};
		});
		// Uitleg per versie één keer, bij het eerste treinstel van die versie
		const gezien = new Set<string>();
		for (const d of lijst) {
			if (d.variant && !gezien.has(d.variant.naam)) {
				gezien.add(d.variant.naam);
				d.uitleg = true;
			}
		}
		// Gekoppelde treinstellen van een verschillende versie: welke is het modernst?
		const rangen = lijst.map((d) => d.variant?.rang).filter((r): r is number => r !== undefined);
		if (new Set(rangen).size > 1) {
			const hoogste = Math.max(...rangen);
			for (const d of lijst) d.moderner = d.variant?.rang === hoogste;
		}
		return lijst;
	});

	// Aaneengesloten treinstellen met dezelfde bestemming vormen één groep, met één haakje eronder
	const groepen = $derived.by((): Groep[] => {
		const uit: Groep[] = [];
		for (const d of delen) {
			const naar = info.splitsing?.bestemmingen.find((b) => b.deel === d.i)?.naar ?? d.deel.eindbestemming;
			const vorige = uit.at(-1);
			if (vorige && vorige.naar === naar) {
				vorige.delen.push(d);
				vorige.jouw ||= d.jouw;
			} else uit.push({ naar, delen: [d], jouw: d.jouw });
		}
		return uit;
	});
	const splitst = $derived(new Set(groepen.map((g) => g.naar).filter(Boolean)).size > 1);
	const heeftDrukte = $derived(delen.some((d) => d.bakken.some((b) => b.drukte)));
	const heeftKenmerken = $derived(delen.some((d) => d.bakken.some((b) => b.eersteKlas || b.stilte)));
	const heeftMisschien = $derived(delen.some((d) => d.bakken.some((b) => b.eersteKlas === 'misschien' || b.stilte === 'misschien')));
	// Eén afbeelding van het hele treinstel (geen afbeelding per bak): die tonen we in zijn geheel
	let kapot = $state<Record<number, boolean>>({});
	const heelBeeld = (d: Deel) => !d.bakken[0]?.afbeelding && !!d.deel.afbeelding && !kapot[d.i];

	// ---------- Scrollen ----------
	let strook = $state<HTMLDivElement>();
	let scrollbaar = $state(false);
	let zichtbaar = $state<Record<string, boolean>>({});
	let randen = $state({ links: false, rechts: false });
	let zelfGescrolld = false;
	const begin = Date.now();

	function meet() {
		if (!strook) return;
		const { scrollLeft, scrollWidth, clientWidth } = strook;
		scrollbaar = scrollWidth > clientWidth + 2;
		randen = { links: scrollLeft > 2, rechts: scrollLeft + clientWidth < scrollWidth - 2 };
		const nieuw: Record<string, boolean> = {};
		for (const el of strook.querySelectorAll<HTMLElement>('[data-bak]')) {
			const midden = el.offsetLeft + el.offsetWidth / 2;
			nieuw[el.dataset.bak!] = midden >= scrollLeft && midden <= scrollLeft + clientWidth;
		}
		zichtbaar = nieuw;
	}

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
		if (bak.eersteKlas) tekst.push(bak.eersteKlas === 'ja' ? 'eerste klas' : 'misschien eerste klas');
		if (bak.stilte) tekst.push(bak.stilte === 'ja' ? 'stiltecoupé' : 'misschien stiltecoupé');
		if (bak.drukte) tekst.push(bak.drukte === 'hoog' ? 'druk' : bak.drukte === 'gemiddeld' ? 'gemiddeld druk' : 'rustig');
		return tekst.join(', ');
	}
	const deelNaam = (d: TreinDeel) => [d.type ?? 'Treinstel', d.nummer].filter(Boolean).join(' · ');
</script>

{#snippet kenmerken(bak: Bak)}
	{#if bak.eersteKlas}<span class="een" class:misschien={bak.eersteKlas === 'misschien'}>1</span>{/if}
	{#if bak.stilte}<span class="stil" class:misschien={bak.stilte === 'misschien'}><VolumeX size={14} aria-hidden="true" /></span>{/if}
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

	<div
		class="strook"
		class:kan-links={randen.links}
		class:kan-rechts={randen.rechts}
		bind:this={strook}
		onscroll={meet}
		onpointerdown={() => (zelfGescrolld = true)}
		onwheel={() => (zelfGescrolld = true)}
		aria-label="Opstelling van de trein op het perron"
		role="group"
	>
		{#each groepen as g, gi (gi)}
			<div class="groep">
				<div class="delen">
					{#each g.delen as d (d.i)}
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
												eersteKlas={bak.eersteKlas === 'ja'}
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
								{#if d.variant}
									<span class="leeftijd {d.variant.leeftijd}" title="{d.variant.naam}: {d.variant.uitleg}">{LEEFTIJD_NAMEN[d.variant.leeftijd]}</span>
								{/if}
								{#if d.moderner}<span class="moderner">Moderner</span>{/if}
								{#if d.eersteErgens || d.stilteErgens}
									<span class="zwak ergens">
										{#if d.eersteErgens}<span class="een klein-een">1</span>{/if}{#if d.stilteErgens}<VolumeX size={12} aria-label="stilte" />{/if} in dit treinstel
									</span>
								{/if}
								{#if d.variant && d.uitleg}<span class="zwak variantuitleg">{d.variant.naam}, {d.variant.uitleg}</span>{/if}
							</div>
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

	{#if scrollbaar}
		<!-- Welk stuk van de trein je ziet: één streepje per bak; tik om erheen te gaan -->
		<div class="wijzer" aria-hidden="true">
			{#each delen as d (d.i)}
				<div class="wijzerdeel">
					{#each d.bakken as bak (bak.sleutel)}
						<button
							type="button"
							tabindex="-1"
							class="streep"
							aria-label="Naar deze bak"
							class:aan={zichtbaar[bak.sleutel]}
							onclick={() => centreer(strook?.querySelector<HTMLElement>(`[data-bak="${bak.sleutel}"]`), true)}
						></button>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	{#if heeftMisschien}
		<p class="uitleg klein zwak"><span class="een misschien">1</span> Licht: in één van deze bakken, afhankelijk van hoe de trein staat.</p>
	{/if}
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

	/* ---------- Strook met de bakken ---------- */
	.strook {
		position: relative;
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding: 2px 2px 4px;
		scrollbar-width: none;
	}
	.strook::-webkit-scrollbar {
		display: none;
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
	.groep {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
	}
	.delen {
		display: flex;
		gap: 10px;
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
	.variantuitleg {
		flex-basis: 100%;
		font-size: 0.72rem;
	}
	.leeftijd,
	.moderner {
		padding: 0 6px;
		border-radius: 6px;
		font-size: 0.7rem;
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
	.moderner {
		background: var(--ok);
		color: var(--bg);
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
	.stil {
		display: inline-flex;
	}
	.misschien {
		opacity: 0.45;
	}
	.een.misschien {
		background: transparent;
		color: var(--tekst);
		box-shadow: inset 0 0 0 1.5px #e6b200;
		opacity: 0.8;
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

	/* ---------- Haakje met bestemming (splitsen) ---------- */
	.haak {
		display: flex;
		align-items: flex-start;
		height: 10px;
		margin: 2px 5px 0;
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
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 2px 6px;
		margin-top: 3px;
		text-align: center;
		font-weight: 650;
		line-height: 1.2;
	}
	.bestemming.jouw {
		color: var(--ok);
	}

	/* ---------- Streepjes: welk stuk je ziet ---------- */
	.wijzer {
		display: flex;
		justify-content: center;
		gap: 6px;
		padding: 0 4px;
	}
	.wijzerdeel {
		display: flex;
		gap: 2px;
	}
	.streep {
		/* Klein streepje, maar met genoeg ruimte om op te tikken */
		appearance: none;
		box-sizing: border-box;
		width: 10px;
		min-width: 0;
		height: 13px;
		min-height: 0;
		padding: 5px 0;
		border: 0;
		border-radius: 2px;
		background-color: var(--rand);
		background-clip: content-box;
		cursor: pointer;
	}
	.streep.aan {
		background-color: var(--tekst-zwak);
	}
	.uitleg {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}
</style>
