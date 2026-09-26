<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronLeft, ChevronDown, RotateCcw, Trash2 } from '@lucide/svelte';
	import type { Reis } from '$lib/types';
	import { data } from '$lib/client/data.svelte';
	import { planner } from '$lib/client/planner.svelte';
	import { klok, korteDatum, vertragingMinuten } from '$lib/tijd';
	import ReisTijdlijn from '$lib/components/ReisTijdlijn.svelte';

	let reizen = $state<Reis[] | null>(null);
	let fout = $state<string | null>(null);
	let open = $state<string | null>(null);

	onMount(async () => {
		try {
			reizen = await data.geschiedenis();
		} catch (e) {
			fout = (e as Error).message;
		}
	});

	function opnieuw(r: Reis) {
		planner.zetReis(r.van, r.naar);
		goto('/');
		void planner.zoek();
	}

	async function verwijder(r: Reis) {
		await data.verwijderReis(r.id);
		reizen = (reizen ?? []).filter((x) => x.id !== r.id);
	}
</script>

<svelte:head><title>Eerdere reizen · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">Eerdere reizen</h1>
	</div>

	{#if fout}<p class="status-fout">{fout}</p>{/if}
	{#if reizen === null && !fout}
		<p class="zwak">Laden…</p>
	{:else if reizen && reizen.length === 0}
		<p class="zwak">Nog geen afgeronde reizen. Reizen die je start komen hier na afloop te staan.</p>
	{/if}

	<ul class="lijst stapel">
		{#each reizen ?? [] as r (r.id)}
			{@const vertraging = vertragingMinuten(r.advies.aankomst)}
			<li class="kaart stapel">
				<button class="kop" aria-expanded={open === r.id} onclick={() => (open = open === r.id ? null : r.id)}>
					<span>
						<strong>{r.van.naam} → {r.naar.naam}</strong><br />
						<span class="zwak klein">
							{korteDatum(r.gestartOp ?? r.aangemaaktOp)} · {klok(r.advies.vertrek.verwacht)}–{klok(r.advies.aankomst.verwacht)}
							{#if vertraging > 0}<span class="status-vertraagd"> · +{vertraging} min</span>{/if}
						</span>
					</span>
					<ChevronDown size={20} style="transform: rotate({open === r.id ? 180 : 0}deg)" aria-hidden="true" />
				</button>
				{#if open === r.id}
					<ReisTijdlijn advies={r.advies} />
					<div class="rij" style="gap: 8px">
						<button class="knop klein" onclick={() => opnieuw(r)}><RotateCcw size={16} /> Plan opnieuw</button>
						<button class="knop gevaar klein" onclick={() => verwijder(r)}><Trash2 size={16} /> Verwijder</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</main>

<style>
	.kop {
		appearance: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		min-height: 44px;
	}
</style>
