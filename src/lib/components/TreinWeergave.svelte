<script lang="ts">
	import { ArrowLeft, ArrowRight, VolumeX } from '@lucide/svelte';
	import type { TreinInfo } from '$lib/types';

	let { info }: { info: TreinInfo } = $props();

	interface Bak {
		eersteKlas: boolean;
		stilte: boolean;
	}

	interface Deel {
		bakken: Bak[];
		/** Alleen bekend per treinstel, niet per bak */
		stilteErgens: boolean;
		eersteErgens: boolean;
	}

	// Per bak alleen markeren als de NS-data per bak zegt waar het is; anders één label per treinstel
	const delen = $derived.by((): Deel[] => {
		const totaal = info.delen.reduce((s, d) => s + Math.max(1, d.bakken), 0);
		let pos = 0;
		return info.delen.map((d) => {
			const n = Math.max(1, d.bakken);
			const bakken: Bak[] = [];
			for (let j = 0; j < n; j++) {
				const midden = (pos + j + 0.5) / totaal;
				const binnen = (r: { van: number; tot: number }[] | undefined) => !!r?.some((x) => midden >= x.van && midden <= x.tot);
				const b = d.indeling?.length === n ? d.indeling[j] : undefined;
				bakken.push({
					eersteKlas: b ? b.eersteKlas : binnen(info.instapadvies?.eersteKlas),
					stilte: b ? b.stilte : binnen(info.instapadvies?.stilte)
				});
			}
			pos += n;
			return {
				bakken,
				stilteErgens: !bakken.some((b) => b.stilte) && d.faciliteiten.some((f) => f.includes('STILTE')),
				eersteErgens: !bakken.some((b) => b.eersteKlas) && !!d.eersteKlas
			};
		});
	});
	const aantal = $derived(delen.reduce((s, d) => s + d.bakken.length, 0));
	const richting = $derived(info.instapadvies?.rijrichting);
	const heeftPerDeel = $derived(delen.some((d) => d.stilteErgens || d.eersteErgens));
</script>

{#if aantal > 0}
	<figure class="trein" aria-label="Opstelling van de trein op het perron">
		{#if richting}
			<div class="richting klein zwak">
				{#if richting === 'links'}<ArrowLeft size={16} aria-hidden="true" /> Rijrichting{:else}Rijrichting <ArrowRight size={16} aria-hidden="true" />{/if}
			</div>
		{/if}
		<div class="delen">
			{#each delen as deel, i (i)}
				<div class="deel" style:flex-grow={deel.bakken.length}>
					{#if heeftPerDeel}
						<div class="deel-label klein zwak">
							{#if deel.eersteErgens}<span class="een klein-een" title="Eerste klas in dit treinstel">1</span>{/if}
							{#if deel.stilteErgens}<VolumeX size={13} aria-label="Stiltecoupé in dit treinstel" />{/if}
						</div>
					{/if}
					<div class="bakken" role="list">
						{#each deel.bakken as bak, j (j)}
							<div
								class="bak"
								class:eerste={bak.eersteKlas}
								role="listitem"
								aria-label="Bak {j + 1}{bak.eersteKlas ? ', eerste klas' : ''}{bak.stilte ? ', stiltecoupé' : ''}"
							>
								{#if bak.eersteKlas}<span class="een">1</span>{/if}
								{#if bak.stilte}<VolumeX size={13} aria-hidden="true" />{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		<figcaption class="legenda klein zwak">
			<span><span class="een klein-een">1</span> eerste klas</span>
			<span><VolumeX size={13} aria-hidden="true" /> stiltecoupé</span>
			{#if heeftPerDeel}<span>boven een treinstel: ergens in dat treinstel</span>{/if}
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
	.delen {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 4px;
	}
	.deel {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.deel-label {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 4px;
		min-height: 16px;
	}
	.bakken {
		display: flex;
		gap: 2px;
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
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-top: 4px;
	}
	.legenda span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>
