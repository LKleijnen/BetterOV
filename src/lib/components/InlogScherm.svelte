<script lang="ts">
	import { LogIn, LogOut, PartyPopper, RefreshCw, ShieldAlert } from '@lucide/svelte';
	import { sessie } from '$lib/client/sessie.svelte';

	let bezig = $state(false);

	async function login() {
		bezig = true;
		await sessie.login();
		bezig = false;
	}
</script>

<main class="pagina inlog">
	<div class="logo" aria-hidden="true">
		<img src="/icon-192.png" alt="" width="88" height="88" />
	</div>
	<h1>BetterOV</h1>
	{#if sessie.status === 'geweigerd'}
		<div class="melding fout" role="alert">
			<ShieldAlert size={20} />
			<div>
				<strong>Geen toegang</strong>
				<p>
					{sessie.email ?? 'Dit account'} staat niet op de uitnodigingslijst. Vraag de beheerder om je toe te voegen.
					{#if sessie.fout}<br /><span class="zwak klein">{sessie.fout}</span>{/if}
					{#if sessie.diagnose}<br /><span class="zwak klein">{sessie.diagnose}</span>{/if}
				</p>
			</div>
		</div>
		<button class="knop vol" onclick={async () => { bezig = true; await sessie.opnieuw(); bezig = false; }} disabled={bezig}>
			<RefreshCw size={18} /> {bezig ? 'Controleren…' : 'Opnieuw controleren'}
		</button>
		<button class="knop tweede vol" onclick={() => sessie.logout()}><LogOut size={18} /> Ander account kiezen</button>
	{:else if sessie.uitnodiging}
		<div class="melding ok">
			<PartyPopper size={20} />
			<div>
				<strong>Je bent uitgenodigd</strong>
				<p>Log in met je Google-account; daarna kun je BetterOV meteen gebruiken.</p>
			</div>
		</div>
	{:else}
		<p class="zwak">Een advertentievrije OV-planner die je reis bewaakt en alternatieven geeft als het misgaat. Alleen op uitnodiging.</p>
	{/if}
	{#if sessie.status !== 'geweigerd'}
		<button class="knop vol" onclick={login} disabled={bezig}>
			<LogIn size={20} /> {bezig ? 'Bezig met inloggen…' : 'Inloggen met Google'}
		</button>
		{#if sessie.fout}<p class="status-fout klein" role="alert">{sessie.fout}</p>{/if}
	{/if}
</main>

<style>
	.inlog {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 16px;
		min-height: 100dvh;
		padding-bottom: 32px;
	}
	.logo img {
		border-radius: 22px;
	}
	.inlog p {
		margin: 0;
		max-width: 34ch;
	}
	.melding {
		text-align: left;
	}
</style>
