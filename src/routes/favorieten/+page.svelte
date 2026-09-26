<script lang="ts">
	import { goto } from '$app/navigation';
	import { ChevronRight, House, MapPin, Plus, Star, Trash2 } from '@lucide/svelte';
	import type { Plek } from '$lib/types';
	import { data } from '$lib/client/data.svelte';
	import { planner, VOORKEUR_LABELS } from '$lib/client/planner.svelte';
	import PlekInvoer from '$lib/components/PlekInvoer.svelte';

	let nieuwePlek = $state<Plek | null>(null);
	let nieuweNaam = $state('');
	let fout = $state<string | null>(null);

	async function planFavoriet(id: string) {
		const f = data.favorieten.find((x) => x.id === id);
		if (!f) return;
		planner.zetReis(f.van, f.naar, f.via ?? null, f.voorkeur);
		goto('/');
		await planner.zoek();
	}

	async function bewaarPlek() {
		fout = null;
		if (!nieuwePlek || !nieuweNaam.trim()) {
			fout = 'Kies een plek en geef hem een naam.';
			return;
		}
		try {
			await data.zetPlek({ naam: nieuweNaam.trim(), plek: nieuwePlek });
			nieuwePlek = null;
			nieuweNaam = '';
		} catch (e) {
			fout = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Favorieten · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<h1>Favorieten</h1>

	<section class="stapel" aria-labelledby="fav-reizen">
		<h2 id="fav-reizen">Favoriete reizen</h2>
		{#if data.favorieten.length === 0}
			<p class="zwak">Nog geen favorieten. Tik op <Star size={16} aria-label="ster" /> bij een reisadvies om de reis te bewaren; daarna plan je hem hier met één tik opnieuw.</p>
		{/if}
		<ul class="lijst stapel">
			{#each data.favorieten as f (f.id)}
				<li class="kaart rij fav">
					<button class="plan" onclick={() => planFavoriet(f.id)}>
						<span>
							<strong>{f.naam ?? `${f.van.naam} → ${f.naar.naam}`}</strong><br />
							<span class="zwak klein">
								{f.naam ? `${f.van.naam} → ${f.naar.naam} · ` : ''}{f.via ? `via ${f.via.naam} · ` : ''}{VOORKEUR_LABELS[f.voorkeur]}
							</span>
						</span>
						<ChevronRight size={20} aria-hidden="true" />
					</button>
					<button class="icoonknop" aria-label="Verwijder favoriet {f.van.naam} naar {f.naar.naam}" onclick={() => data.verwijderFavoriet(f.id)}><Trash2 size={18} /></button>
				</li>
			{/each}
		</ul>
	</section>

	<section class="stapel" aria-labelledby="fav-plekken">
		<h2 id="fav-plekken">Favoriete plekken</h2>
		<p class="zwak klein">Plekken verschijnen bovenaan bij het kiezen van een van- of naar-adres.</p>
		<ul class="lijst stapel">
			{#if data.profiel.thuislocatie}
				<li class="kaart rij">
					<House size={20} aria-hidden="true" />
					<span class="flex"><strong>Thuis</strong><br /><span class="zwak klein">{data.profiel.thuislocatie.naam}</span></span>
					<a class="knop tweede klein" href="/instellingen">Wijzig</a>
				</li>
			{:else}
				<li><a class="knop tweede" href="/instellingen"><House size={18} /> Thuislocatie instellen</a></li>
			{/if}
			{#each data.plekken as p (p.id)}
				<li class="kaart rij">
					<MapPin size={20} aria-hidden="true" />
					<span class="flex"><strong>{p.naam}</strong><br /><span class="zwak klein">{p.plek.naam}</span></span>
					<button class="icoonknop" aria-label="Verwijder {p.naam}" onclick={() => data.verwijderPlek(p.id)}><Trash2 size={18} /></button>
				</li>
			{/each}
		</ul>

		<form class="kaart stapel" onsubmit={(e) => (e.preventDefault(), bewaarPlek())}>
			<h3>Plek toevoegen</h3>
			<label class="stapel veldlabel">
				<span class="label">Naam</span>
				<input class="veld" bind:value={nieuweNaam} placeholder="Bijvoorbeeld Werk of Oma" maxlength="40" />
			</label>
			<PlekInvoer label="Adres, halte of station" bind:waarde={nieuwePlek} gps />
			<button class="knop" type="submit"><Plus size={18} /> Bewaar plek</button>
			{#if fout}<p class="status-fout klein">{fout}</p>{/if}
		</form>
	</section>
</main>

<style>
	.fav {
		padding: 0;
		gap: 0;
		padding-right: 8px;
	}
	.plan {
		appearance: none;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 14px 16px;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}
	.flex {
		flex: 1;
		min-width: 0;
	}
	.veldlabel {
		gap: 4px;
	}
	p :global(svg) {
		vertical-align: -3px;
	}
</style>
