<script lang="ts">
	import { ChevronLeft, ChevronRight, Search, TrainFront, TrainFrontTunnel, TramFront } from '@lucide/svelte';
	import { laadVoertuigen, variantAnker, zoekVoertuigen, type Treffer, type Voertuig } from '$lib/voertuigen';

	let lijst = $state.raw<Voertuig[]>([]);
	let fout = $state<string | null>(null);
	let zoek = $state('');

	laadVoertuigen()
		.then((l) => (lijst = l))
		.catch(() => (fout = 'De voertuigen konden niet worden geladen.'));

	const treffers = $derived(zoekVoertuigen(lijst, zoek));
	const opNummer = $derived(/^\s*\d{3,5}\s*$/.test(zoek) && treffers.some((t) => t.variant !== undefined));
	const groepen = $derived.by(() => {
		const uit = new Map<string, Treffer[]>();
		for (const t of treffers) uit.set(t.voertuig.groep, [...(uit.get(t.voertuig.groep) ?? []), t]);
		return [...uit];
	});

	const eersteZin = (tekst: string) => tekst.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? tekst;
	const link = (t: Treffer) =>
		t.variant !== undefined ? `/voertuigen/${t.voertuig.id}?nummer=${zoek.trim()}#${variantAnker(t.variant)}` : `/voertuigen/${t.voertuig.id}`;
</script>

<svelte:head><title>Voertuigen · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">Voertuigen</h1>
	</div>
	<p class="zwak">Alles over de treinen, trams en metro's: versies, techniek, geschiedenis en leuke feiten.</p>

	<label class="zoekveld">
		<Search size={18} aria-hidden="true" />
		<input type="search" bind:value={zoek} placeholder="Zoek op naam, type of treinstelnummer" aria-label="Zoek een voertuig" />
	</label>

	{#if fout}
		<p class="status-fout">{fout}</p>
	{:else if !lijst.length}
		<p class="zwak">Laden…</p>
	{:else if !treffers.length}
		<p class="zwak">Niets gevonden voor “{zoek}”.</p>
	{/if}

	{#each groepen as [groep, items] (groep)}
		<section class="stapel" aria-label={groep}>
			<h2 class="groepnaam">{groep}</h2>
			<ul class="lijst kaart menu">
				{#each items as t (t.voertuig.id)}
					<li>
						<a href={link(t)}>
							{#if t.voertuig.soort === 'tram'}<TramFront size={20} aria-hidden="true" />{:else if t.voertuig.soort === 'metro'}<TrainFrontTunnel size={20} aria-hidden="true" />{:else}<TrainFront size={20} aria-hidden="true" />{/if}
							<span class="tekst">
								<strong>{t.voertuig.naam}</strong>
								<span class="zwak klein">
									{#if opNummer && t.variant !== undefined}
										Treinstel {zoek.trim()}: {t.voertuig.varianten[t.variant].naam || t.voertuig.varianten[t.variant].code}
									{:else}
										{eersteZin(t.voertuig.kort)}
									{/if}
								</span>
							</span>
							<ChevronRight size={18} aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</main>

<style>
	.zoekveld {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		background: var(--kaart);
		color: var(--tekst-zwak);
	}
	.zoekveld input {
		flex: 1;
		min-width: 0;
		min-height: 46px;
		border: 0;
		background: none;
		color: var(--tekst);
		font: inherit;
		outline: none;
	}
	.groepnaam {
		margin: 6px 0 0;
		font-size: 0.95rem;
		color: var(--tekst-zwak);
	}
	.menu {
		padding: 4px 0;
	}
	.menu li + li {
		border-top: 1px solid var(--rand);
	}
	.menu a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		color: var(--tekst);
		text-decoration: none;
	}
	.tekst {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
