<script lang="ts">
	import { ArrowUp, VolumeX } from '@lucide/svelte';
	import type { Drukte as DrukteType, TreinInfo } from '$lib/types';
	import BakVak from './BakVak.svelte';
	import Drukte from './Drukte.svelte';

	let { info }: { info: TreinInfo } = $props();

	interface Bak {
		eersteKlas: boolean;
		stilte: boolean;
		drukte?: DrukteType;
		afbeelding?: string;
		index: number;
	}

	// Voorkant van de trein bovenaan. NS tekent de trein zoals je hem op het perron ziet; rijdt hij
	// naar rechts, dan draaien we de volgorde om.
	const richting = $derived(info.instapadvies?.rijrichting);
	const omgekeerd = $derived(richting === 'rechts');
	const jouw = $derived(new Set(info.splitsing?.voorUitstappen ? info.splitsing.jouwDelen : []));

	const delen = $derived.by(() => {
		const totaal = info.delen.reduce((s, d) => s + Math.max(1, d.bakken), 0);
		let pos = 0;
		const lijst = info.delen.map((d, i) => {
			const n = Math.max(1, d.bakken);
			const perBak = d.indeling?.length === n ? d.indeling : undefined;
			const bakken: Bak[] = Array.from({ length: n }, (_, j) => {
				const midden = (pos + j + 0.5) / totaal;
				const binnen = (r: { van: number; tot: number }[] | undefined) => !!r?.some((x) => midden >= x.van && midden <= x.tot);
				const b = perBak?.[j];
				return {
					eersteKlas: b ? b.eersteKlas : binnen(info.instapadvies?.eersteKlas),
					stilte: b ? b.stilte : binnen(info.instapadvies?.stilte),
					drukte: b?.drukte,
					afbeelding: d.bakAfbeeldingen?.length === n ? d.bakAfbeeldingen[j] : undefined,
					index: j
				};
			});
			pos += n;
			return {
				i,
				deel: d,
				bakken: omgekeerd ? [...bakken].reverse() : bakken,
				stilteErgens: !bakken.some((b) => b.stilte) && d.faciliteiten.some((f) => f.includes('STILTE')),
				eersteErgens: !bakken.some((b) => b.eersteKlas) && !!d.eersteKlas
			};
		});
		return omgekeerd ? lijst.reverse() : lijst;
	});

	const heeftAfbeeldingen = $derived(info.delen.some((d) => d.bakAfbeeldingen?.length || d.afbeelding));
	const hoogte = $derived(heeftAfbeeldingen ? 88 : 56);
	const meerdereDelen = $derived(info.delen.length > 1);
</script>

<figure class="trein" aria-label="Opstelling van de trein, voorkant boven">
	{#if richting}
		<div class="voorkant klein zwak"><ArrowUp size={14} aria-hidden="true" /> Voorkant (rijrichting)</div>
	{/if}
	<div class="rol">
		{#each delen as d (d.i)}
			{#if meerdereDelen || d.deel.eindbestemming || jouw.has(d.i)}
				<div class="deelkop klein" class:jouw={jouw.has(d.i)}>
					<span>
						<strong>{d.deel.type ?? 'Treinstel'}</strong>
						<span class="zwak">{[d.deel.nummer, d.deel.eindbestemming ? `→ ${d.deel.eindbestemming}` : ''].filter(Boolean).join(' ')}</span>
					</span>
					{#if jouw.has(d.i)}<span class="jouwlabel">Jouw deel</span>{/if}
				</div>
			{/if}
			{#if d.stilteErgens || d.eersteErgens}
				<p class="klein zwak ergens">
					{[d.eersteErgens ? 'eerste klas' : '', d.stilteErgens ? 'stiltecoupé' : ''].filter(Boolean).join(' en ')} ergens in dit treinstel
				</p>
			{/if}
			{#each d.bakken as bak (bak.index)}
				<div class="bakrij" style:min-height="{hoogte + 4}px">
					<BakVak
						afbeelding={bak.afbeelding}
						deelAfbeelding={!bak.afbeelding ? d.deel.afbeelding : undefined}
						index={bak.index}
						aantal={d.bakken.length}
						{omgekeerd}
						eersteKlas={bak.eersteKlas}
						{hoogte}
					/>
					<div class="bakinfo">
						{#if bak.eersteKlas}<span class="kenmerk"><span class="een">1</span> 1e klas</span>{/if}
						{#if bak.stilte}<span class="kenmerk"><VolumeX size={15} aria-hidden="true" /> stilte</span>{/if}
						{#if bak.drukte && bak.drukte !== 'onbekend'}<span class="kenmerk"><Drukte drukte={bak.drukte} /></span>{/if}
					</div>
				</div>
			{/each}
		{/each}
	</div>
</figure>

<style>
	.trein {
		margin: 0;
	}
	.voorkant {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}
	.rol {
		max-height: 55dvh;
		overflow-y: auto;
		padding: 2px 4px 2px 2px;
		border: 1px solid var(--rand);
		border-radius: var(--radius-klein);
		background: var(--kaart);
	}
	.deelkop {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		margin: 4px 0 2px;
		border-radius: 8px;
		background: var(--kaart-2);
	}
	.deelkop.jouw {
		background: var(--ok-zacht);
	}
	.jouwlabel {
		flex: 0 0 auto;
		padding: 1px 7px;
		border-radius: 6px;
		background: var(--ok);
		color: var(--bg);
		font-weight: 750;
		font-size: 0.75rem;
	}
	.ergens {
		margin: 2px 8px;
	}
	.bakrij {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 2px 8px;
	}
	.bakinfo {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 0.85rem;
	}
	.kenmerk {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.een {
		display: inline-flex;
		width: 18px;
		height: 18px;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		background: #ffc917;
		color: #0b1a4a;
		font-weight: 800;
		font-size: 0.8rem;
	}
</style>
