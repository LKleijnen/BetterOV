<script lang="ts">
	import { goto } from '$app/navigation';
	import { ChevronLeft, Pencil, Play, Plus, Trash2 } from '@lucide/svelte';
	import type { Plek, WeekItem } from '$lib/types';
	import { data } from '$lib/client/data.svelte';
	import { startVasteReis } from '$lib/client/reisacties';
	import PlekInvoer from '$lib/components/PlekInvoer.svelte';

	const DAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

	let bewerk = $state<string | null>(null);
	let naam = $state('');
	let dagen = $state<number[]>([1, 2, 3, 4, 5]);
	let tijd = $state('08:00');
	let soort = $state<'vertrek' | 'aankomst'>('vertrek');
	let van = $state<Plek | null>(null);
	let naar = $state<Plek | null>(null);
	let formulier = $state(false);
	let fout = $state<string | null>(null);
	let bezig = $state<string | null>(null);

	const lijst = $derived([...data.weekplanning].sort((a, b) => a.tijd.localeCompare(b.tijd)));

	function nieuw() {
		bewerk = null;
		naam = '';
		dagen = [1, 2, 3, 4, 5];
		tijd = '08:00';
		soort = 'vertrek';
		van = data.profiel.thuislocatie ?? null;
		naar = null;
		formulier = true;
		fout = null;
	}

	function wijzig(w: WeekItem) {
		bewerk = w.id;
		naam = w.naam ?? '';
		dagen = [...w.dagen];
		tijd = w.tijd;
		soort = w.soort;
		van = w.van;
		naar = w.naar;
		formulier = true;
		fout = null;
	}

	function wisselDag(d: number) {
		dagen = dagen.includes(d) ? dagen.filter((x) => x !== d) : [...dagen, d].sort();
	}

	async function bewaar() {
		fout = null;
		if (!van || !naar) return (fout = 'Kies van en naar.');
		if (dagen.length === 0) return (fout = 'Kies minstens één dag.');
		await data.zetWeekItem({ id: bewerk ?? undefined, naam: naam.trim() || undefined, dagen, tijd, soort, van, naar });
		formulier = false;
	}

	async function start(w: WeekItem) {
		bezig = w.id;
		fout = null;
		try {
			const reis = await startVasteReis(w);
			if (reis) goto('/reis');
			else fout = 'Geen passende reis gevonden.';
		} catch (e) {
			fout = (e as Error).message;
		} finally {
			bezig = null;
		}
	}
</script>

<svelte:head><title>Weekplanning · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">Weekplanning</h1>
	</div>
	<p class="zwak">Vaste reizen, zoals naar werk of school. Op de dagen dat ze gelden staan ze op het beginscherm, en start je ze met één tik als actieve reis.</p>

	{#if fout}<p class="status-fout">{fout}</p>{/if}

	<ul class="lijst stapel">
		{#each lijst as w (w.id)}
			<li class="kaart stapel">
				<div class="rij tussen">
					<div>
						<strong>{w.naam ?? `${w.van.naam} → ${w.naar.naam}`}</strong><br />
						<span class="zwak klein">
							{w.soort === 'aankomst' ? 'Aankomst' : 'Vertrek'} {w.tijd} · {w.dagen.map((d) => DAGEN[d - 1]).join(', ')}
						</span>
						{#if w.naam}<br /><span class="zwak klein">{w.van.naam} → {w.naar.naam}</span>{/if}
					</div>
				</div>
				<div class="rij" style="gap: 8px">
					<button class="knop klein" onclick={() => start(w)} disabled={bezig !== null}><Play size={16} /> {bezig === w.id ? 'Plannen…' : 'Start nu'}</button>
					<button class="icoonknop" aria-label="Wijzig" onclick={() => wijzig(w)}><Pencil size={18} /></button>
					<button class="icoonknop" aria-label="Verwijder" onclick={() => data.verwijderWeekItem(w.id)}><Trash2 size={18} /></button>
				</div>
			</li>
		{:else}
			<li class="zwak">Nog geen vaste reizen.</li>
		{/each}
	</ul>

	{#if formulier}
		<form class="kaart stapel" onsubmit={(e) => (e.preventDefault(), bewaar())}>
			<h2>{bewerk ? 'Vaste reis wijzigen' : 'Vaste reis toevoegen'}</h2>
			<label class="stapel groep">
				<span class="label">Naam (optioneel)</span>
				<input class="veld" bind:value={naam} placeholder="Naar werk" maxlength="40" />
			</label>
			<PlekInvoer label="Van" bind:waarde={van} gps={false} />
			<PlekInvoer label="Naar" bind:waarde={naar} gps={false} />
			<div class="stapel groep">
				<span class="label">Dagen</span>
				<div class="chips" role="group" aria-label="Dagen">
					{#each DAGEN as d, i (d)}
						<button type="button" class="chip" aria-pressed={dagen.includes(i + 1)} onclick={() => wisselDag(i + 1)}>{d}</button>
					{/each}
				</div>
			</div>
			<div class="rij" style="gap: 8px">
				<div class="chips" role="group" aria-label="Soort tijd">
					<button type="button" class="chip" aria-pressed={soort === 'vertrek'} onclick={() => (soort = 'vertrek')}>Vertrek</button>
					<button type="button" class="chip" aria-pressed={soort === 'aankomst'} onclick={() => (soort = 'aankomst')}>Aankomst</button>
				</div>
				<input class="veld" type="time" bind:value={tijd} aria-label="Tijd" required style="max-width: 140px" />
			</div>
			<div class="rij" style="gap: 8px">
				<button class="knop tweede" type="button" onclick={() => (formulier = false)}>Annuleren</button>
				<button class="knop" type="submit">Opslaan</button>
			</div>
		</form>
	{:else}
		<button class="knop tweede" onclick={nieuw}><Plus size={18} /> Vaste reis toevoegen</button>
	{/if}
</main>

<style>
	.groep {
		gap: 4px;
	}
</style>
