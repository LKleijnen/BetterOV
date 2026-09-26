<script lang="ts">
	import { Bell, BellOff, Check, ChevronLeft, TriangleAlert } from '@lucide/svelte';
	import type { Plek, Voorkeur } from '$lib/types';
	import { data } from '$lib/client/data.svelte';
	import { sessie } from '$lib/client/sessie.svelte';
	import { VOORKEUR_LABELS } from '$lib/client/planner.svelte';
	import { isIOS, isStandalone, pushStatus, zetPushAan, lokaleMelding, type PushStatus } from '$lib/client/push';
	import { weergave, type Thema } from '$lib/client/thema.svelte';
	import PlekInvoer from '$lib/components/PlekInvoer.svelte';

	const themas: { waarde: Thema; label: string }[] = [
		{ waarde: 'systeem', label: 'Automatisch' },
		{ waarde: 'licht', label: 'Licht' },
		{ waarde: 'donker', label: 'Donker' }
	];

	let naam = $state(data.profiel.naam ?? sessie.naam ?? '');
	let thuis = $state<Plek | null>(data.profiel.thuislocatie ?? null);
	let voorkeur = $state<Voorkeur>(data.profiel.standaardvoorkeur ?? 'snelst');
	let opgeslagen = $state(false);
	let fout = $state<string | null>(null);

	let push = $state<PushStatus>(pushStatus());
	let pushMelding = $state<string | null>(null);
	let pushBezig = $state(false);

	// Waarden bijwerken als het profiel later binnenkomt
	let geladen = false;
	$effect(() => {
		if (geladen || !data.geladen) return;
		geladen = true;
		naam = data.profiel.naam ?? sessie.naam ?? '';
		thuis = data.profiel.thuislocatie ?? null;
		voorkeur = data.profiel.standaardvoorkeur ?? 'snelst';
	});

	async function bewaar() {
		fout = null;
		try {
			await data.slaProfielOp({ naam: naam.trim() || undefined, thuislocatie: thuis ?? undefined, standaardvoorkeur: voorkeur });
			opgeslagen = true;
			setTimeout(() => (opgeslagen = false), 2000);
		} catch (e) {
			fout = (e as Error).message;
		}
	}

	async function pushAan() {
		pushBezig = true;
		const r = await zetPushAan();
		push = r.status;
		pushMelding = r.melding ?? null;
		pushBezig = false;
	}

	async function test() {
		await lokaleMelding('Testmelding', 'Zo ziet een melding tijdens je reis eruit.', '/reis', 'test');
	}
</script>

<svelte:head><title>Instellingen · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">Instellingen</h1>
	</div>

	<form class="kaart stapel" onsubmit={(e) => (e.preventDefault(), bewaar())}>
		<label class="stapel veld-groep">
			<span class="label">Naam</span>
			<input class="veld" bind:value={naam} maxlength="40" autocomplete="given-name" />
			<span class="zwak klein">Zichtbaar voor mensen met wie je een reis deelt.</span>
		</label>
		<PlekInvoer label="Thuislocatie" bind:waarde={thuis} wisbaar />
		<span class="zwak klein">Voor "Laatste verbinding naar huis".</span>
		<div class="stapel veld-groep">
			<span class="label">Standaardvoorkeur</span>
			<div class="chips" role="group" aria-label="Standaardvoorkeur">
				{#each Object.entries(VOORKEUR_LABELS) as [v, label] (v)}
					<button type="button" class="chip" aria-pressed={voorkeur === v} onclick={() => (voorkeur = v as Voorkeur)}>{label}</button>
				{/each}
			</div>
		</div>
		<button class="knop" type="submit">{#if opgeslagen}<Check size={18} /> Opgeslagen{:else}Opslaan{/if}</button>
		{#if fout}<p class="status-fout klein">{fout}</p>{/if}
	</form>

	<section class="kaart stapel" aria-labelledby="push-kop">
		<h2 id="push-kop" class="rij"><Bell size={20} aria-hidden="true" /> Meldingen tijdens je reis</h2>
		<p class="zwak klein">Je krijgt binnen twee minuten een melding als een rit uitvalt, een overstap niet meer haalbaar is, het spoor wijzigt of je flink later aankomt.</p>
		{#if isIOS() && !isStandalone()}
			<div class="melding waarschuwing klein"><TriangleAlert size={16} /> <span>Op iPhone werken meldingen alleen als je de app eerst op je beginscherm zet (Meer → Op beginscherm zetten).</span></div>
		{/if}
		{#if push === 'aan'}
			<div class="melding ok klein"><Check size={16} /> <span>Meldingen staan aan op dit apparaat.</span></div>
			<button class="knop tweede" onclick={test}>Stuur testmelding</button>
		{:else if push === 'geweigerd'}
			<div class="melding fout klein"><BellOff size={16} /> <span>Meldingen zijn geblokkeerd. Sta ze toe in de instellingen van je browser of telefoon.</span></div>
		{:else if push === 'niet-ondersteund'}
			<div class="melding waarschuwing klein"><BellOff size={16} /> <span>{pushMelding ?? 'Dit apparaat of deze browser ondersteunt geen pushmeldingen.'}</span></div>
		{:else}
			<button class="knop" onclick={pushAan} disabled={pushBezig}><Bell size={18} /> {pushBezig ? 'Bezig…' : 'Meldingen aanzetten'}</button>
		{/if}
		{#if pushMelding && push !== 'niet-ondersteund'}<p class="klein zwak">{pushMelding}</p>{/if}
		{#if !sessie.pushIngesteld && !sessie.demo}
			<p class="klein zwak">Let op: de server voor achtergrondmeldingen is nog niet ingesteld.</p>
		{/if}
	</section>

	<section class="kaart stapel" aria-labelledby="weergave-kop">
		<h2 id="weergave-kop">Weergave</h2>
		<div class="chips" role="group" aria-label="Weergave">
			{#each themas as t (t.waarde)}
				<button type="button" class="chip" aria-pressed={weergave.thema === t.waarde} onclick={() => weergave.zet(t.waarde)}>{t.label}</button>
			{/each}
		</div>
		{#if weergave.thema === 'systeem'}<p class="zwak klein">Volgt de lichte of donkere modus van je telefoon.</p>{/if}
	</section>
</main>

<style>
	.veld-groep {
		gap: 4px;
	}
	h2.rij {
		gap: 8px;
		margin: 0;
	}
</style>
