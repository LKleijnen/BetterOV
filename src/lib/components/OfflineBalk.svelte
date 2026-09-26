<script lang="ts">
	import { WifiOff } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let online = $state(true);

	onMount(() => {
		online = navigator.onLine;
		const aan = () => (online = true);
		const uit = () => (online = false);
		addEventListener('online', aan);
		addEventListener('offline', uit);
		return () => {
			removeEventListener('online', aan);
			removeEventListener('offline', uit);
		};
	});
</script>

{#if !online}
	<div class="offline" role="status">
		<WifiOff size={16} aria-hidden="true" />
		Geen verbinding. Je ziet de laatst opgehaalde gegevens.
	</div>
{/if}

<style>
	.offline {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: calc(env(safe-area-inset-top) + 6px) 12px 6px;
		background: var(--vertraagd-zacht);
		color: var(--tekst);
		font-size: 0.88rem;
		font-weight: 600;
	}
</style>
