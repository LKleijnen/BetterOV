<script lang="ts">
	import { ChevronLeft, ExternalLink } from '@lucide/svelte';
</script>

<svelte:head><title>Over · BetterOV</title></svelte:head>

<main class="pagina stapel">
	<div class="rij">
		<a class="icoonknop" href="/meer" aria-label="Terug"><ChevronLeft size={22} /></a>
		<h1 style="margin: 0">Over BetterOV</h1>
	</div>

	<section class="kaart stapel">
		<p>BetterOV is een advertentievrije OV-planner voor een kleine kring vrienden en familie. De app bewaakt je reis en geeft alternatieven als het misgaat.</p>
		<p class="zwak klein">Open source: <a href="https://github.com/lkleijnen/betterov" rel="noopener" target="_blank">github.com/lkleijnen/betterov</a></p>
	</section>

	<section class="kaart stapel">
		<h2>Bronnen</h2>
		<ul class="bronnen">
			<li>Routeplanning en vertrektijden: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> (MOTIS) — <a href="https://transitous.org/sources/" target="_blank" rel="noopener">gebruikte databronnen <ExternalLink size={12} /></a></li>
			<li>Treininformatie, drukte, samenstelling, prijzen en fallback-planner: <a href="https://apiportal.ns.nl" target="_blank" rel="noopener">NS API</a></li>
			<li>Kaart: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-bijdragers</a>, <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a></li>
			<li>Prijzen voor bus, tram en metro zijn schattingen (indicatie) op basis van vaste tarieven.</li>
		</ul>
	</section>

	<section class="kaart stapel">
		<h2>Privacy</h2>
		<ul class="bronnen">
			<li>Je gegevens (favorieten, reizen, instellingen) staan in Firebase en zijn alleen voor jou zichtbaar.</li>
			<li>Je locatie wordt alleen gebruikt als je daarom vraagt (huidige locatie, Nu vertrekken, laatste verbinding, live kaart) en niet opgeslagen.</li>
			<li>Deel je een reis live, dan wordt je laatste locatie hooguit elke minuut opgeslagen en automatisch verwijderd als de gedeelde reis verloopt.</li>
			<li>Geen advertenties, geen tracking.</li>
		</ul>
	</section>
</main>

<style>
	.bronnen {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	p {
		margin: 0;
	}
</style>
