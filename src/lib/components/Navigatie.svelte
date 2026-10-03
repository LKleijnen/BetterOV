<script lang="ts">
	import { page } from '$app/state';
	import { Ellipsis, Navigation, Route, Signpost, Star } from '@lucide/svelte';
	import { data } from '$lib/client/data.svelte';

	const items = $derived([
		{ href: '/', label: 'Plannen', icoon: Route, actief: page.url.pathname === '/' || page.url.pathname.startsWith('/advies') || page.url.pathname.startsWith('/reisadviezen') },
		{ href: '/vertrektijden', label: 'Vertrek', icoon: Signpost, actief: page.url.pathname.startsWith('/vertrektijden') || page.url.pathname.startsWith('/rit') },
		{ href: '/reis', label: 'Reis', icoon: Navigation, actief: page.url.pathname === '/reis' || page.url.pathname.startsWith('/reis/'), stip: !!data.actieveReis },
		{ href: '/favorieten', label: 'Favorieten', icoon: Star, actief: page.url.pathname.startsWith('/favorieten') },
		{ href: '/meer', label: 'Meer', icoon: Ellipsis, actief: ['/meer', '/instellingen', '/weekplanning', '/geschiedenis', '/beheer', '/over', '/voertuigen'].some((p) => page.url.pathname.startsWith(p)) }
	]);
</script>

<nav class="navigatie" aria-label="Hoofdmenu">
	<ul class="lijst">
		{#each items as item (item.href)}
			<li>
				<a href={item.href} aria-current={item.actief ? 'page' : undefined} class:actief={item.actief}>
					<span class="icoon">
						<item.icoon size={24} aria-hidden="true" />
						{#if item.stip}<span class="stip" aria-label="actieve reis"></span>{/if}
					</span>
					<span class="tekst">{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.navigatie {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--kaart) 92%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid var(--rand);
		padding-bottom: env(safe-area-inset-bottom);
	}
	ul {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		max-width: var(--max-breedte);
		margin: 0 auto;
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: var(--nav-hoogte);
		color: var(--tekst-zwak);
		text-decoration: none;
		font-size: 0.72rem;
		font-weight: 650;
		-webkit-tap-highlight-color: transparent;
	}
	a.actief {
		color: var(--primair);
	}
	.icoon {
		position: relative;
		display: inline-flex;
	}
	.stip {
		position: absolute;
		top: -2px;
		right: -4px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--ok);
		border: 2px solid var(--kaart);
	}
</style>
