<script lang="ts">
	import { ArrowLeft, ArrowRight, VolumeX } from '@lucide/svelte';
	import type { TreinInfo } from '$lib/types';

	let { info }: { info: TreinInfo } = $props();

	interface Bak {
		deel: number;
		eersteKlas: boolean;
		stilte: boolean;
	}

	// Bakken tekenen; als de indeling per bak ontbreekt, gebruiken we de posities uit het instapadvies
	const bakken = $derived.by((): Bak[] => {
		const lijst: Bak[] = [];
		const totaal = info.delen.reduce((s, d) => s + Math.max(1, d.bakken), 0);
		let pos = 0;
		info.delen.forEach((d, i) => {
			const n = Math.max(1, d.bakken);
			for (let j = 0; j < n; j++) {
				const midden = (pos + j + 0.5) / totaal;
				const binnen = (r: { van: number; tot: number }[] | undefined) => !!r?.some((x) => midden >= x.van && midden <= x.tot);
				const b = d.indeling?.[j];
				lijst.push({
					deel: i,
					eersteKlas: b ? b.eersteKlas : binnen(info.instapadvies?.eersteKlas),
					stilte: b ? b.stilte : binnen(info.instapadvies?.stilte)
				});
			}
			pos += n;
		});
		return lijst;
	});
	const richting = $derived(info.instapadvies?.rijrichting);
</script>

{#if bakken.length > 0}
	<figure class="trein" aria-label="Opstelling van de trein op het perron">
		{#if richting}
			<div class="richting klein zwak">
				{#if richting === 'links'}<ArrowLeft size={16} aria-hidden="true" /> Rijrichting{:else}Rijrichting <ArrowRight size={16} aria-hidden="true" />{/if}
			</div>
		{/if}
		<div class="bakken" role="list">
			{#each bakken as bak, i (i)}
				<div
					class="bak"
					class:nieuwdeel={i > 0 && bakken[i - 1].deel !== bak.deel}
					class:eerste={bak.eersteKlas}
					role="listitem"
					aria-label="Bak {i + 1}{bak.eersteKlas ? ', eerste klas' : ''}{bak.stilte ? ', stiltecoupé' : ''}"
				>
					{#if bak.eersteKlas}<span class="een">1</span>{/if}
					{#if bak.stilte}<VolumeX size={13} aria-hidden="true" />{/if}
				</div>
			{/each}
		</div>
		<figcaption class="legenda klein zwak">
			<span><span class="een klein-een">1</span> eerste klas</span>
			<span><VolumeX size={13} aria-hidden="true" /> stiltecoupé</span>
		</figcaption>
	</figure>
{/if}

<style>
	.trein {
		margin: 8px 0;
	}
	.richting {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}
	.bakken {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		padding-bottom: 4px;
	}
	.bak {
		flex: 1 0 22px;
		min-width: 22px;
		height: 34px;
		border-radius: 5px;
		background: var(--kaart-2);
		border: 1px solid var(--rand);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		color: var(--tekst);
	}
	.bak.eerste {
		background: #ffc917;
		border-color: #e6b200;
		color: #0b1a4a;
	}
	.nieuwdeel {
		margin-left: 6px;
	}
	.een {
		font-weight: 800;
		font-size: 0.8rem;
		line-height: 1;
	}
	.klein-een {
		display: inline-flex;
		width: 16px;
		height: 16px;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		background: #ffc917;
		color: #0b1a4a;
	}
	.legenda {
		display: flex;
		gap: 16px;
		margin-top: 4px;
	}
	.legenda span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>
