<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let { open = $bindable(false), titel, children }: { open: boolean; titel: string; children: Snippet } = $props();

	let dialoog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialoog) return;
		if (open && !dialoog.open) dialoog.showModal();
		if (!open && dialoog.open) dialoog.close();
	});
</script>

<dialog bind:this={dialoog} class="onderblad" aria-label={titel} onclose={() => (open = false)} onclick={(e) => e.target === dialoog && (open = false)}>
	<div class="inhoud">
		<div class="rij tussen kop">
			<h2>{titel}</h2>
			<button type="button" class="icoonknop" aria-label="Sluiten" onclick={() => (open = false)}><X size={20} /></button>
		</div>
		{#if open}{@render children()}{/if}
	</div>
</dialog>

<style>
	.onderblad {
		border: 0;
		padding: 0;
		margin: auto auto 0;
		width: 100%;
		max-width: var(--max-breedte);
		max-height: 88dvh;
		border-radius: 18px 18px 0 0;
		background: var(--bg);
		color: var(--tekst);
		box-shadow: 0 -8px 30px rgb(0 0 0 / 25%);
	}
	.onderblad::backdrop {
		background: rgb(0 0 0 / 45%);
	}
	.inhoud {
		padding: 12px 14px calc(env(safe-area-inset-bottom) + 16px);
		overflow-y: auto;
		max-height: 88dvh;
	}
	.kop {
		margin-bottom: 8px;
	}
	.kop h2 {
		margin: 0;
		font-size: 1.1rem;
	}
</style>
