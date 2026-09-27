<script lang="ts">
	import { goto } from '$app/navigation';
	import { ChevronLeft, Clock, Info, Pencil, Star, TriangleAlert } from '@lucide/svelte';
	import type { Voorkeur } from '$lib/types';
	import { momentTekst, planner, VOORKEUR_LABELS } from '$lib/client/planner.svelte';
	import { data } from '$lib/client/data.svelte';
	import { klok } from '$lib/tijd';
	import AdviesKaart from '$lib/components/AdviesKaart.svelte';

	const voorkeuren: Voorkeur[] = ['snelst', 'overstappen', 'goedkoopst', 'drukte'];

	// Zonder zoekopdracht (bijvoorbeeld na herladen zonder resultaten) terug naar het startscherm
	$effect(() => {
		if (!planner.laden && planner.adviezen.length === 0 && !planner.fout && !planner.gezocht) goto('/', { replaceState: true });
	});

	const van = $derived(planner.gezocht?.van ?? planner.van);
	const naar = $derived(planner.gezocht?.naar ?? planner.naar);

	const favoriet = $derived(van && naar ? data.isFavoriet(van, naar) : undefined);
	async function wisselFavoriet() {
		if (!van || !naar) return;
		if (favoriet) await data.verwijderFavoriet(favoriet.id);
		else await data.zetFavoriet({ van, naar, via: planner.via ?? undefined, voorkeur: planner.voorkeur });
	}

	const toonDrukteKeuze = $derived(planner.drukteBeschikbaar || planner.voorkeur === 'drukte');
</script>

<svelte:head><title>Reisadviezen · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<header class="rij kop">
		<a class="icoonknop" href="/" aria-label="Terug naar plannen"><ChevronLeft size={22} /></a>
		<a class="titel" href="/" aria-label="Zoekopdracht aanpassen">
			<h1>{van?.naam ?? '…'} → {naar?.naam ?? '…'}</h1>
			<span class="zwak klein rij">{momentTekst(planner)}{planner.via ? ` · via ${planner.via.naam}` : ''} <Pencil size={12} aria-hidden="true" /></span>
		</a>
		<button type="button" class="icoonknop" aria-label={favoriet ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'} aria-pressed={!!favoriet} onclick={wisselFavoriet}>
			<Star size={20} fill={favoriet ? 'currentColor' : 'none'} />
		</button>
	</header>

	<div class="chips" role="group" aria-label="Sorteer op">
		{#each voorkeuren as v (v)}
			{#if v !== 'drukte' || toonDrukteKeuze}
				<button type="button" class="chip" aria-pressed={planner.voorkeur === v} disabled={planner.laden !== null} onclick={() => planner.kiesVoorkeur(v)}>{VOORKEUR_LABELS[v]}</button>
			{/if}
		{/each}
	</div>

	{#if planner.melding}
		<div class="melding waarschuwing" role="status"><Info size={18} /> <span>{planner.melding}</span></div>
	{/if}
	{#if planner.fout}
		<div class="melding fout" role="alert"><TriangleAlert size={18} /> <span>{planner.fout}</span></div>
	{/if}

	{#if planner.vorige && planner.laden !== 'nieuw'}
		<button class="tekstknop meer" onclick={() => planner.meer('eerder')} disabled={planner.laden !== null}>
			<Clock size={16} /> {planner.laden === 'eerder' ? 'Laden…' : 'Eerder'}
		</button>
	{/if}

	{#if planner.laden === 'nieuw'}
		{#each [1, 2, 3, 4] as i (i)}<div class="kaart skelet" aria-hidden="true"></div>{/each}
	{:else}
		{#each planner.adviezen as advies (advies.id)}
			<AdviesKaart {advies} href="/advies/{advies.id}" toonDrukte={planner.drukteBeschikbaar} />
		{:else}
			{#if !planner.fout}<p class="zwak">Geen reizen gevonden.</p>{/if}
		{/each}
	{/if}

	{#if planner.volgende && planner.laden !== 'nieuw'}
		<button class="tekstknop meer" onclick={() => planner.meer('later')} disabled={planner.laden !== null}>
			<Clock size={16} /> {planner.laden === 'later' ? 'Laden…' : 'Later'}
		</button>
	{/if}
	{#if planner.opgehaaldOp && planner.laden !== 'nieuw'}
		<p class="zwak klein midden">
			{#if planner.bron === 'ns'}Via NS-planner{:else}Via <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous</a>{/if} · {klok(planner.opgehaaldOp)}{planner.uitCache ? ' (opgeslagen)' : ''}
		</p>
	{/if}
</main>

<style>
	.kop {
		align-items: center;
	}
	.titel {
		flex: 1;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}
	.titel h1 {
		font-size: 1.05rem;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.titel .rij {
		gap: 4px;
	}
	.meer {
		align-self: center;
	}
	.skelet {
		height: 104px;
		background: linear-gradient(90deg, var(--kaart) 0%, var(--kaart-2) 50%, var(--kaart) 100%);
		background-size: 200% 100%;
		animation: glans 1.2s linear infinite;
	}
	@keyframes glans {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}
	.midden {
		text-align: center;
		margin: 0;
	}
</style>
