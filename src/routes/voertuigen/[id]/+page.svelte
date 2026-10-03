<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ChevronLeft, ExternalLink, ImageOff, TrainFront } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { laadVoertuigen, variantAnker, variantVoorNummer, type Voertuig } from '$lib/voertuigen';
	import { wikiFoto, type WikiFoto } from '$lib/client/wikifoto';

	let { params }: PageProps = $props();

	let lijst = $state.raw<Voertuig[] | null>(null);
	laadVoertuigen()
		.then((l) => (lijst = l))
		.catch(() => (lijst = []));

	const voertuig = $derived(lijst?.find((v) => v.id === params.id));
	// Vanuit Voertuiginfo: het treinstel waar je in zat
	const nummer = $derived(page.url.searchParams.get('nummer') ?? undefined);
	const jouwVariant = $derived(voertuig ? variantVoorNummer(voertuig, nummer) : -1);

	// ---------- Foto (van Wikipedia/Wikimedia Commons, opgehaald door je browser) ----------
	let foto = $state<WikiFoto | null>(null);
	let fotoStatus = $state<'laden' | 'klaar' | 'geen'>('laden');
	let fotoVoor = '';
	$effect(() => {
		const w = voertuig?.wikipedia;
		const sleutel = w ? `${w.taal}:${w.titel}` : '';
		if (sleutel === fotoVoor) return;
		fotoVoor = sleutel;
		foto = null;
		if (!w) {
			fotoStatus = 'geen';
			return;
		}
		fotoStatus = 'laden';
		wikiFoto(w.taal, w.titel)
			.then((f) => {
				foto = f;
				fotoStatus = f ? 'klaar' : 'geen';
			})
			.catch(() => (fotoStatus = 'geen'));
	});

	// Naar jouw versie scrollen als je vanuit Voertuiginfo komt
	let gescrold = false;
	$effect(() => {
		if (gescrold || jouwVariant < 0) return;
		gescrold = true;
		void tick().then(() => document.getElementById(variantAnker(jouwVariant))?.scrollIntoView({ block: 'center' }));
	});

	function variantFeiten(va: Voertuig['varianten'][number]): [string, string][] {
		const uit: [string, string][] = [];
		if (va.herkenning) uit.push(['Herkennen', va.herkenning]);
		if (va.bakken) uit.push(['Bakken', va.bakken]);
		if (va.zitplaatsen) uit.push(['Zitplaatsen', va.zitplaatsen]);
		if (va.gebouwd) uit.push(['Gebouwd', va.gebouwd]);
		if (va.gemoderniseerd) uit.push(['Vernieuwd', va.gemoderniseerd]);
		return uit;
	}

	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};
</script>

<svelte:head><title>{voertuig?.naam ?? 'Voertuig'} · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij kop">
		<button class="icoonknop" aria-label="Terug" onclick={() => (history.length > 1 ? history.back() : goto('/voertuigen'))}><ChevronLeft size={22} /></button>
		<h1>{voertuig?.naam ?? 'Voertuig'}</h1>
	</div>

	{#if lijst === null}
		<p class="zwak">Laden…</p>
	{:else if !voertuig}
		<div class="kaart stapel">
			<p>Dit voertuig staat (nog) niet in de app.</p>
			<a class="knop" href="/voertuigen">Alle voertuigen</a>
		</div>
	{:else}
		<figure class="foto">
			{#if foto}
				<img src={foto.url} alt="Foto van een {voertuig.naam}" width={foto.breedte} height={foto.hoogte} loading="lazy" />
				<figcaption class="klein zwak">
					Foto{foto.maker ? `: ${foto.maker}` : ''}{#if foto.licentie}, {#if foto.licentieUrl}<a href={foto.licentieUrl} target="_blank" rel="noopener">{foto.licentie}</a>{:else}{foto.licentie}{/if}{/if}
					· <a href={foto.pagina} target="_blank" rel="noopener">Wikimedia Commons</a>
				</figcaption>
			{:else}
				<div class="geenfoto" aria-hidden="true">
					{#if fotoStatus === 'laden'}<TrainFront size={40} />{:else}<ImageOff size={32} />{/if}
				</div>
			{/if}
		</figure>

		<p class="kort">{voertuig.kort}</p>
		{#if voertuig.vervoerders}<p class="zwak klein">Rijdt bij: {voertuig.vervoerders}</p>{/if}

		{#if jouwVariant >= 0}
			<div class="melding info klein">
				<TrainFront size={16} />
				<span>Jij zat in treinstel <strong>{nummer}</strong>: {voertuig.varianten[jouwVariant].naam || voertuig.varianten[jouwVariant].code}.</span>
			</div>
		{/if}

		<section class="stapel" aria-labelledby="versies">
			<h2 id="versies">Versies</h2>
			{#each voertuig.varianten as va, i (i)}
				<article class="kaart stapel versie" class:jouw={i === jouwVariant} id={variantAnker(i)}>
					<div class="rij tussen">
						<h3>{va.naam || va.code}</h3>
						{#if i === jouwVariant}<span class="jouwlabel">Jouw trein</span>{/if}
					</div>
					{#if va.naam && va.code !== va.naam}<span class="zwak klein code">{va.code}</span>{/if}
					<p>{va.omschrijving}</p>
					{#if variantFeiten(va).length}
						<dl class="feiten klein">
							{#each variantFeiten(va) as [label, waarde] (label)}
								<dt class="zwak">{label}</dt>
								<dd>{waarde}</dd>
							{/each}
						</dl>
					{/if}
				</article>
			{/each}
		</section>

		{#if voertuig.techniek.length}
			<section class="kaart stapel" aria-labelledby="techniek">
				<h2 id="techniek">Techniek</h2>
				<dl class="feiten">
					{#each voertuig.techniek as t, i (i)}
						<dt class="zwak">{t.label}</dt>
						<dd>{t.waarde}</dd>
					{/each}
				</dl>
			</section>
		{/if}

		{#if voertuig.kosten}
			<section class="kaart stapel" aria-labelledby="kosten">
				<h2 id="kosten">Wat kostte hij?</h2>
				<p>{voertuig.kosten}</p>
			</section>
		{/if}

		{#if voertuig.geschiedenis.length}
			<section class="stapel" aria-labelledby="geschiedenis">
				<h2 id="geschiedenis">Geschiedenis</h2>
				{#each voertuig.geschiedenis as alinea, i (i)}<p>{alinea}</p>{/each}
			</section>
		{/if}

		{#if voertuig.feiten.length}
			<section class="kaart stapel" aria-labelledby="feiten">
				<h2 id="feiten">Leuke feiten</h2>
				<ul class="feitenlijst">
					{#each voertuig.feiten as feit, i (i)}<li>{feit}</li>{/each}
				</ul>
			</section>
		{/if}

		<section class="stapel" aria-labelledby="bronnen">
			<h2 id="bronnen">Meer lezen</h2>
			<ul class="lijst bronnen">
				{#each voertuig.bronnen as b (b.url)}
					<li>
						<a href={b.url} target="_blank" rel="noopener">{b.titel} <ExternalLink size={12} aria-hidden="true" /></a>
						<span class="zwak klein">{host(b.url)}</span>
					</li>
				{/each}
			</ul>
			<p class="zwak klein">Uit openbare bronnen verzameld; cijfers kunnen per bron iets verschillen.</p>
		</section>
	{/if}
</main>

<style>
	.kop {
		align-items: center;
	}
	.kop h1 {
		margin: 0;
		font-size: 1.25rem;
		min-width: 0;
	}
	.foto {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.foto img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 300px;
		object-fit: cover;
		border-radius: var(--radius);
		background: var(--kaart-2);
	}
	.geenfoto {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 160px;
		border-radius: var(--radius);
		background: var(--kaart-2);
		color: var(--tekst-zwak);
	}
	figcaption a {
		color: inherit;
	}
	.kort {
		font-size: 1.02rem;
		margin: 0;
	}
	p {
		margin: 0;
	}
	h2 {
		margin: 8px 0 0;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
	}
	.versie {
		gap: 6px;
		scroll-margin-top: 80px;
	}
	.versie.jouw {
		outline: 3px solid var(--ok);
		outline-offset: -1px;
	}
	.code {
		margin-top: -4px;
	}
	.jouwlabel {
		flex: 0 0 auto;
		white-space: nowrap;
		padding: 1px 7px;
		border-radius: 6px;
		background: var(--ok);
		color: var(--bg);
		font-weight: 750;
		font-size: 0.72rem;
	}
	.feiten {
		display: grid;
		grid-template-columns: minmax(84px, auto) 1fr;
		gap: 4px 12px;
		margin: 0;
	}
	.feiten dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.feitenlijst {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bronnen {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.bronnen li {
		display: flex;
		flex-direction: column;
	}
</style>
