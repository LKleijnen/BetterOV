<script lang="ts">
	import '../app.css';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { sessie } from '$lib/client/sessie.svelte';
	import { data } from '$lib/client/data.svelte';
	import { actief } from '$lib/client/actief.svelte';
	import { planner } from '$lib/client/planner.svelte';
	import { isStandalone } from '$lib/client/push';
	import { lees, schrijf } from '$lib/client/opslag';
	import Navigatie from '$lib/components/Navigatie.svelte';
	import OfflineBalk from '$lib/components/OfflineBalk.svelte';
	import InlogScherm from '$lib/components/InlogScherm.svelte';
	import Onderblad from '$lib/components/Onderblad.svelte';
	import InstallatieUitleg from '$lib/components/InstallatieUitleg.svelte';

	let { children } = $props();

	const publiek = $derived(page.url.pathname.startsWith('/gedeeld/'));
	let geopendOp = 0;
	let doorgestuurd = false;
	let uitlegOpen = $state(false);

	onMount(() => {
		geopendOp = Date.now();
		planner.herstel();
		if (!publiek) sessie.start();
	});

	$effect(() => {
		const uid = sessie.status === 'ingelogd' ? sessie.uid : null;
		untrack(() => data.start(uid));
	});

	$effect(() => {
		const heeftReis = !!data.actieveReis;
		void data.actieveReis?.gedeeldId;
		untrack(() => {
			if (heeftReis) {
				actief.start();
				actief.synchroniseerLocatieDelen();
			} else {
				actief.stop();
			}
		});
	});

	// Tijdens een reis is het actieve-reisscherm het startscherm
	$effect(() => {
		if (doorgestuurd || !data.actieveReis || publiek) return;
		if (page.url.pathname === '/' && Date.now() - geopendOp < 5000) {
			doorgestuurd = true;
			goto('/reis', { replaceState: true });
		}
	});

	// Installatie-uitleg bij de eerste login (push op iOS werkt alleen vanaf het beginscherm)
	let uitlegGetoond = false;
	$effect(() => {
		if (sessie.status !== 'ingelogd' || !data.geladen || publiek || uitlegGetoond) return;
		if (isStandalone() || data.profiel.installatieUitlegGezien || lees('uitleg-gezien', false)) return;
		uitlegGetoond = true;
		uitlegOpen = true;
	});

	// Ook sluiten via het kruisje telt als gezien
	$effect(() => {
		if (uitlegGetoond && !uitlegOpen) uitlegGezien();
	});

	function uitlegGezien() {
		uitlegOpen = false;
		if (lees('uitleg-gezien', false)) return;
		schrijf('uitleg-gezien', true);
		void data.slaProfielOp({ installatieUitlegGezien: true }).catch(() => {});
	}
</script>

{#if publiek}
	{@render children()}
{:else if sessie.status === 'laden'}
	<div class="laden" aria-busy="true" aria-label="Laden"></div>
{:else if sessie.status === 'uitgelogd' || sessie.status === 'geweigerd'}
	<InlogScherm />
{:else}
	<OfflineBalk />
	{@render children()}
	<Navigatie />
	<Onderblad bind:open={uitlegOpen} titel="Zet BetterOV op je beginscherm">
		<InstallatieUitleg />
		<button class="knop vol" style="margin-top: 16px" onclick={uitlegGezien}>Begrepen</button>
	</Onderblad>
{/if}

<style>
	.laden {
		min-height: 100dvh;
	}
</style>
