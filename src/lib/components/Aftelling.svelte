<script lang="ts">
	import { onDestroy } from 'svelte';
	import { aftelling } from '$lib/tijd';

	let { doel, voorvoegsel = '' }: { doel: number; voorvoegsel?: string } = $props();

	let nu = $state(Date.now());
	const timer = setInterval(() => (nu = Date.now()), 1000);
	onDestroy(() => clearInterval(timer));

	const tekst = $derived(aftelling(doel, nu));
	const minuten = $derived(Math.max(0, Math.round((doel - nu) / 60000)));
</script>

<span class="aftelling tijd" role="timer" aria-live="off" aria-label="{voorvoegsel} nog {minuten} minuten">{tekst}</span>

<style>
	.aftelling {
		font-variant-numeric: tabular-nums;
	}
</style>
